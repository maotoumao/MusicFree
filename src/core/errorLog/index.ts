/**
 * 错误日志：把渲染期与未捕获的 JS 异常留成可复制的诊断材料
 *
 * 目的很窄——**让用户能把一段可离线符号化的文本发给开发者**。故：
 * - `stack` 逐字保真（不美化 / 不折行 / 不改缩进），`metro-symbolicate` 吃的是精确的行:列
 * - 版本号与 build 放在报告最前，map 是逐次构建的产物、版本对不上会静默映射到错处
 * - 结构化字段只含插件的 platform + version，绝不主动读取用户变量值
 * - 但异常的 message / stack 是**插件自己写的自由文本**：插件完全可以
 *   `throw new Error(env.userVariables.cookie)`，凭据就从这条间接通道进了报告。
 *   故落盘前把已知的变量值逐个替换成 `***`。这是**尽力而为**、不是保证——
 *   插件若把凭据变形后再抛（拼接 / 编码）就拦不住，界面上因此也标了提醒
 *
 * 全程 best-effort：这是出错之后才跑的代码，自己再抛一次只会把原始错误盖掉
 */
import { getInstallationId } from '@/infra/installationId';
import { navigationRef } from '@/infra/navigation';
import { getObject, getOrCreateMMKV, setObject } from '@/infra/storage';

import { setErrorRecords } from './store';
import {
    ERROR_LOG_KEY,
    ERROR_LOG_STORE_ID,
    MAX_COMPONENT_STACK_CHARS,
    MAX_ERROR_RECORDS,
    MAX_NON_ERROR_CHARS,
    MAX_STACK_CHARS,
    REPEAT_PERSIST_INTERVAL_MS,
} from './types';

import type {
    ErrorCapture,
    ErrorLogDeps,
    ErrorLogEnvironment,
    ErrorRecord,
    IErrorLog,
    ErrorSource,
} from './types';
import type { IPluginManager } from '@/core/plugin';

/** 纯文本报告里的来源标签（报告本身不走 i18n，固定中文） */
const SOURCE_LABEL: Record<ErrorSource, string> = {
    render: '渲染异常',
    uncaught: '未捕获异常',
    localData: '本地数据异常',
};

/**
 * 来源标签查表：记录是从盘上读回来的，旧版本写下的 / 新版本才有的来源值在这里可能查不到——
 * 错误日志是出错之后才跑的代码，绝不能自己再抛，查不到就原样打出来
 */
function sourceLabel(source: string): string {
    return (SOURCE_LABEL as Partial<Record<string, string>>)[source] ?? source;
}

export class ErrorLog implements IErrorLog {
    readonly #pluginManager: IPluginManager;
    readonly #env: ErrorLogEnvironment;
    readonly #mmkv = getOrCreateMMKV(ERROR_LOG_STORE_ID);
    #records: ErrorRecord[] = [];
    #hydrated = false;
    /** 上次真正写盘的时间；leading + trailing 限流共用 */
    #lastPersistAt = 0;
    #flushHandle: ReturnType<typeof setTimeout> | null = null;
    /** 进程内单调序号：同毫秒同 name 的两个错误也不会撞 id */
    #sequence = 0;

    constructor(deps: ErrorLogDeps) {
        this.#pluginManager = deps.pluginManager;
        this.#env = deps.environment;
    }

    capture(input: ErrorCapture): void {
        try {
            this.#hydrate();
            const next = this.#toRecord(input);
            const previous = this.#records[0];
            if (previous && isSameIncident(previous, next)) {
                // 连续重复只累加：渲染错误容易成环，逐条落盘会把有价值的旧记录冲光
                this.#records[0] = {
                    ...previous,
                    lastAt: next.lastAt,
                    count: previous.count + 1,
                };
                this.#schedulePersist();
                return;
            }
            this.#records = [next, ...this.#records].slice(
                0,
                MAX_ERROR_RECORDS,
            );
            this.#schedulePersist();
        } catch {
            // 记录失败就算了：不能让诊断代码盖掉它要诊断的那个错误
        }
    }

    getRecords(): readonly ErrorRecord[] {
        try {
            this.#hydrate();
        } catch {
            // 读盘失败退化为内存态
        }
        // 不交出内部活数组：调用方拿到后我们仍会原地改它
        return [...this.#records];
    }

    formatReport(id: string): string | undefined {
        const record = this.getRecords().find(it => it.id === id);
        return record ? this.#format(record) : undefined;
    }

    clear(): void {
        this.#records = [];
        this.#hydrated = true;
        try {
            this.#persist();
        } catch {
            // 与 capture / getRecords 同口径：写盘失败退化为仅内存
        }
    }

    /** 供测试与生命周期收口用：把挂起的写盘立刻落下 */
    flush(): void {
        if (this.#flushHandle !== null) {
            clearTimeout(this.#flushHandle);
            this.#flushHandle = null;
            this.#persist();
        }
    }

    // —— 内部实现 ——

    /** 懒读盘：启动路径全程不碰这个 store，只在真要用时才付 JSON.parse */
    #hydrate(): void {
        if (this.#hydrated) {
            return;
        }
        this.#hydrated = true;
        const stored = getObject<ErrorRecord[]>(this.#mmkv, ERROR_LOG_KEY);
        this.#records = Array.isArray(stored)
            ? stored.slice(0, MAX_ERROR_RECORDS)
            : [];
        setErrorRecords(this.#records);
    }

    #persist(): void {
        this.#lastPersistAt = this.#env.now();
        // 必须发新引用：重复计数是原地改 #records[0]，发同一个引用时
        // jotai 会按 Object.is 判无变化、一个订阅者都不通知，页面上的「发生 N 次」永远不动
        setErrorRecords([...this.#records]);
        setObject(this.#mmkv, ERROR_LOG_KEY, this.#records);
    }

    /**
     * leading + trailing 限流：**新记录与重复计数走同一个闸门**
     *
     * 只挡重复是不够的——两个错误交替出现（A、B、A、B…）时每一条都是「新记录」，
     * 会绕过限流同步狂写 MMKV。而首次仍立即落盘：出错的下一刻进程就可能被杀，
     * 那一条必须先着地。窗口内的后续变更由 trailing 定时器兜底，不会永远停在旧值
     */
    #schedulePersist(): void {
        if (
            this.#env.now() - this.#lastPersistAt >=
            REPEAT_PERSIST_INTERVAL_MS
        ) {
            this.#persist();
            return;
        }
        if (this.#flushHandle !== null) {
            return;
        }
        this.#flushHandle = setTimeout(() => {
            this.#flushHandle = null;
            this.#persist();
        }, REPEAT_PERSIST_INTERVAL_MS);
    }

    #toRecord(input: ErrorCapture): ErrorRecord {
        const at = this.#env.now();
        const { name, message, stack } = describeError(input.error);
        const redact = this.#redactor();
        return {
            id: `${at}-${(this.#sequence += 1)}`,
            source: input.source,
            name,
            message: redact(message),
            // 先脱敏再截断：截断会算长度，顺序反了会让上限随凭据长度漂移
            stack: truncateTail(redact(stack), MAX_STACK_CHARS),
            componentStack: input.componentStack
                ? truncateTail(input.componentStack, MAX_COMPONENT_STACK_CHARS)
                : undefined,
            route: currentRoute(),
            plugins: this.#enabledPlugins(),
            firstAt: at,
            lastAt: at,
            count: 1,
        };
    }

    /**
     * 把已知的插件变量值替换成 `***`
     *
     * 读取凭据只为在本地把它们从文本里抹掉，抹完的结果才是要交给用户复制的东西。
     * 按长度倒序替换，避免短值是长值前缀时只抹掉一半
     */
    #redactor(): (text: string) => string {
        let secrets: string[] = [];
        try {
            secrets = this.#pluginManager
                .getAll()
                .flatMap(plugin =>
                    Object.values(
                        this.#pluginManager.getUserVariables(plugin.platform),
                    ),
                )
                // 太短的值（如 "1"）到处都是，抹了反而把栈搅烂
                .filter(value => typeof value === 'string' && value.length >= 6)
                .sort((a, b) => b.length - a.length);
        } catch {
            secrets = [];
        }
        if (secrets.length === 0) {
            return text => text;
        }
        return text =>
            secrets.reduce(
                (acc, secret) => acc.split(secret).join('***'),
                text,
            );
    }

    /** 只出 platform 与 version：用户变量值是凭据，永远不进报告 */
    #enabledPlugins(): readonly string[] {
        try {
            return this.#pluginManager
                .getAll()
                .filter(plugin =>
                    this.#pluginManager.isEnabled(plugin.platform),
                )
                .map(plugin =>
                    plugin.version
                        ? `${plugin.platform} ${plugin.version}`
                        : plugin.platform,
                );
        } catch {
            return [];
        }
    }

    #format(record: ErrorRecord): string {
        const env = this.#env;
        const repeat = record.count > 1 ? ` · 发生 ${record.count} 次` : '';
        const lines = [
            'MusicFree 错误报告',
            `版本 ${env.appVersion} (${env.buildNumber}) · ${env.os} ${env.osVersion} · ${env.deviceModel}`,
            `设备标识 ${safeInstallationId()}`,
            `时间 ${new Date(record.lastAt).toISOString()}`,
            `页面 ${record.route ?? '未知'}`,
            `来源 ${sourceLabel(record.source)}${repeat}`,
            '',
            `${record.name}: ${record.message}`,
            '',
            '--- 调用栈（请保持原样，改动会导致无法定位）---',
            record.stack,
        ];
        if (record.componentStack) {
            lines.push('', '--- 组件栈 ---', record.componentStack);
        }
        lines.push(
            '',
            '--- 已启用插件 ---',
            record.plugins.length > 0 ? record.plugins.join('\n') : '无',
        );
        return lines.join('\n');
    }
}

/** 同一起事故：名称、消息与栈首帧都一致 */
function isSameIncident(a: ErrorRecord, b: ErrorRecord): boolean {
    return (
        a.source === b.source &&
        a.name === b.name &&
        a.message === b.message &&
        firstFrame(a.stack) === firstFrame(b.stack)
    );
}

function firstFrame(stack: string): string {
    return stack.split('\n', 2)[1] ?? '';
}

/**
 * 只截尾部并标注：头部帧是符号化最需要的
 * 不 trim、不折行——栈必须逐字保真
 */
function truncateTail(text: string, limit: number): string {
    if (text.length <= limit) {
        return text;
    }
    return `${text.slice(0, limit)}\n…（已截断 ${text.length - limit} 字符）`;
}

/** 抛出的不一定是 Error：插件是第三方代码，什么都可能扔出来 */
function describeError(error: unknown): {
    name: string;
    message: string;
    stack: string;
} {
    if (error instanceof Error) {
        return {
            name: error.name || 'Error',
            message: error.message,
            stack: error.stack ?? '',
        };
    }
    // 只留类型标签 + 限长文本：插件可能抛整个 axios response，
    // 那里面的 headers.Cookie 会逐字进「请发给开发者」的文本
    const described = safeStringify(error);
    return {
        name: 'NonError',
        message:
            described.length > MAX_NON_ERROR_CHARS
                ? `${described.slice(0, MAX_NON_ERROR_CHARS)}…（已截断）`
                : described,
        stack: '',
    };
}

/**
 * 抛出的值可能连字符串化都会抛：插件能扔一个 `toJSON` 与 `Symbol.toPrimitive`
 * 都抛错的对象。两层各自兜底，都失败就写占位——决不能让 `capture` 整条丢掉
 */
function safeStringify(value: unknown): string {
    if (typeof value === 'string') {
        return value;
    }
    try {
        // stringify 对 undefined / 函数返回的是 undefined 而非字符串
        const json = JSON.stringify(value);
        if (typeof json === 'string') {
            return json;
        }
    } catch {
        // 落到下面的 String()
    }
    try {
        return String(value);
    } catch {
        return '[无法转为文本的抛出值]';
    }
}

function currentRoute(): string | undefined {
    try {
        return navigationRef.isReady()
            ? navigationRef.getCurrentRoute()?.name
            : undefined;
    } catch {
        return undefined;
    }
}

function safeInstallationId(): string {
    try {
        return getInstallationId();
    } catch {
        return '未知';
    }
}

/**
 * 装配前的替身：`assembleContainer` 抛错时 `provideErrorLog` 不会执行，
 * 而错误边界与兜底页那时正好要用它。留个纯内存实现，调用方无须处处判空
 */
class MemoryErrorLog implements IErrorLog {
    #records: ErrorRecord[] = [];

    capture(input: ErrorCapture): void {
        const { name, message, stack } = describeError(input.error);
        this.#records = [
            {
                id: `pre-boot-${this.#records.length}`,
                source: input.source,
                name,
                message,
                stack,
                componentStack: input.componentStack,
                plugins: [],
                firstAt: 0,
                lastAt: 0,
                count: 1,
            },
            ...this.#records,
        ].slice(0, MAX_ERROR_RECORDS);
    }

    getRecords(): readonly ErrorRecord[] {
        return this.#records;
    }

    formatReport(id: string): string | undefined {
        const record = this.#records.find(it => it.id === id);
        return record
            ? `${record.name}: ${record.message}\n${record.stack}`
            : undefined;
    }

    clear(): void {
        this.#records = [];
    }
}

export let errorLog: IErrorLog = new MemoryErrorLog();

export function provideErrorLog(instance: IErrorLog): void {
    errorLog = instance;
}

export { useErrorRecords } from './hooks';
export type { ErrorRecord, ErrorSource, IErrorLog } from './types';
