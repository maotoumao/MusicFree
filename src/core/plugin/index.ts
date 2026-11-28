/**
 * 插件管理器：安装 / 卸载 / 列表 / 启停 / 排序 / 用户变量 / 替代源 / 订阅 / 更新 / 启动对账
 * live 列表真相源 = store.ts pluginsAtom；设置 + 注册表 = meta.ts；源码文件 = sourceStore
 */
import { readFile } from '@dr.pogodin/react-native-fs';
import axios from 'axios';
import { compareVersions, satisfies } from 'compare-versions';
import CryptoJS from 'crypto-js';

import { appVersion } from '@/infra/device';
import { delay } from '@/infra/timer';
import { safeParse } from '@/utils/json';
import { isLocalPlatform } from '@/utils/media';
import { clamp } from '@/utils/number';
import { looksLikeHttpUrl } from '@/utils/url';

import { localPlugin } from './localPlugin';
import { PluginMeta } from './meta';
import { PluginImpl } from './plugin';
import { compile, createSandboxEnv } from './sandbox';
import { PluginSourceStore } from './sourceStore';
import { getPlugins, setPlugins } from './store';

import type {
    InstallResult,
    InstalledPluginTransfer,
    IPluginManager,
    IPluginTransfer,
    Plugin,
    PluginAlternativeTransfer,
    PluginManagerDeps,
    PluginMetaRecord,
    PluginInstallFailure,
    PluginsRestoreResult,
    PluginsTransfer,
    SubscribeSource,
    NetworkFailureDetail,
} from './types';
import type { IConfig } from '@/core/config';
import type { MediaBase, MediaType, PluginDefinition } from '@/types';

/** 待删清单保留期：编译失败的陌生文件超此时长才删（宽限自身 bug 修复发版的周期） */
const QUARANTINE_RETENTION_MS = 20 * 24 * 60 * 60 * 1000;

/** 清理段延后时长：让首屏渲染先跑完再做磁盘整理 */
const CLEANUP_DELAY_MS = 3000;

/** 批量安装插件时，CDN 请求的最大并发数 */
const FETCH_CONCURRENCY = 6;

/** 单次插件源码或订阅清单请求的超时时间（ms），避免单个请求阻塞整批任务并长期保持 busy 状态 */
const FETCH_TIMEOUT_MS = 15000;

/** 自动更新的最小间隔：每天最多一轮 */
const AUTO_UPDATE_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** #fetchSource 的返回值：成功时包含源码，失败时包含可直接返回的 InstallResult */
type FetchedSource =
    | { ok: true; source: string }
    | Extract<InstallResult, { ok: false }>;

/**
 * 把请求异常压成一条给用户看的线索：有响应就报状态码，超时报 timeout，其余不猜
 * 只读 `response.status` / `code` 的形状、不绑定 axios 的类型守卫：这两个字段是 HTTP 客户端错误的通用约定，
 * 换客户端也不用改这里
 */
function describeFetchError(e: unknown): NetworkFailureDetail | undefined {
    if (!e || typeof e !== 'object') {
        return undefined;
    }
    const { response, code } = e as {
        response?: { status?: unknown };
        code?: unknown;
    };
    if (typeof response?.status === 'number') {
        return { kind: 'status', status: response.status };
    }
    return code === 'ECONNABORTED' ? { kind: 'timeout' } : undefined;
}

/**
 * 拿回来的是不是网页：只认 HTML 文档特征（doctype / html / head / body / meta / title 起头），
 * 不能只看 `<`——以 `<!--` 起头的脚本是合法 JS，不能误杀。BOM 与首部空白先跳过
 */
const HTML_DOCUMENT_HEAD =
    /^\uFEFF?\s*<(?:!doctype\b|html\b|head\b|body\b|meta\b|title\b)/i;

function looksLikeHtmlDocument(text: string): boolean {
    return HTML_DOCUMENT_HEAD.test(text);
}

/** 批量安装的一个待办：URL + 可选「这是对某已装插件的更新」目标标记 */
type InstallJob = { url: string; updateTarget?: string };

/** 按输入顺序返回结果的有界并发 map；最多启动 limit 个 worker，fn 必须自行处理异常 */
async function mapConcurrent<T, R>(
    items: readonly T[],
    limit: number,
    fn: (item: T) => Promise<R>,
): Promise<R[]> {
    const results = new Array<R>(items.length);
    let cursor = 0;
    const runWorker = async (): Promise<void> => {
        while (cursor < items.length) {
            const index = cursor;
            cursor += 1;
            const item = items[index];
            if (item !== undefined) {
                results[index] = await fn(item);
            }
        }
    };
    const count = clamp(limit, 1, items.length);
    await Promise.all(Array.from({ length: count }, runWorker));
    return results;
}

export class PluginManager implements IPluginManager, IPluginTransfer {
    readonly #config: IConfig;
    readonly #store = new PluginSourceStore();
    readonly #meta = new PluginMeta();
    /** setup 完成注册表与源码文件同步后解除 ready 屏障；写操作会先等待该屏障，避免启动期间的更新被全量发布覆盖 */
    readonly #ready: Promise<void>;
    #markReady!: () => void;
    /** 安装、卸载与清理事务通过提交链串行执行，避免同一 platform 的并发写入冲突；网络请求在链外并发执行 */
    #commitChain: Promise<unknown> = Promise.resolve();
    /** 最近一次启动对账是否成功；失败时 snapshotPlugins 拒绝，避免产出残缺备份 */
    #reconcileOk = false;

    constructor(deps: PluginManagerDeps) {
        this.#config = deps.config;
        this.#ready = new Promise<void>(resolve => {
            this.#markReady = resolve;
        });
    }

    // —— 安装 ——

    async installFromFile(path: string): Promise<InstallResult[]> {
        await this.#ready;
        // TODO content:// URI（Android SAF/picker）留 song-import 轮；本轮只吃可直接读的路径
        if (this.#isJsonSource(path)) {
            let urls: string[] | null;
            try {
                urls = this.#parsePluginUrls(await readFile(path, 'utf8'));
            } catch {
                return [{ ok: false, reason: 'invalid' }];
            }
            if (urls === null) {
                return [{ ok: false, reason: 'invalid' }];
            }
            return this.#installMany(
                urls.map(pluginUrl => ({ url: pluginUrl })),
            );
        }
        let source: string;
        try {
            source = await readFile(path, 'utf8');
        } catch {
            return [{ ok: false, reason: 'invalid' }];
        }
        return [await this.#install(source)];
    }

    async installFromUrl(url: string): Promise<InstallResult[]> {
        await this.#ready;
        const fetched = await this.#fetchSource(url);
        if (!fetched.ok) {
            return [fetched];
        }
        const text = fetched.source;
        // 订阅清单 → 展开成插件 url 列表批量装。后缀是 .json 的一律按清单读；
        // 不是 .json 的也先嗅一眼内容——订阅地址并不都以 .json 结尾（接口式地址、短链），
        // 把清单当 JS 编译只会报一个让人摸不着头脑的「解析失败」
        const manifestUrls = this.#parsePluginUrls(text);
        if (this.#isJsonSource(url) || manifestUrls !== null) {
            if (manifestUrls === null) {
                return [{ ok: false, reason: 'invalid' }];
            }
            return this.#installMany(
                manifestUrls.map(pluginUrl => ({ url: pluginUrl })),
            );
        }
        return [await this.#install(text, url)];
    }

    /** 将写事务追加到提交链并串行执行；失败仅向当前调用方传播，不中断后续事务 */
    #enqueueCommit<T>(task: () => Promise<T>): Promise<T> {
        const run = this.#commitChain.then(task);
        this.#commitChain = run.catch(() => undefined);
        return run;
    }

    /** 将已获取源码的安装事务加入串行提交链 */
    #install(
        source: string,
        srcUrl?: string,
        updateTarget?: string,
        skipIfInstalled = false,
    ): Promise<InstallResult> {
        return this.#enqueueCommit(() =>
            this.#commitInstall(source, srcUrl, updateTarget, skipIfInstalled),
        );
    }

    /**
     * 串行执行安装提交：编译并读取元数据，计算 hash，再按 platform 校验
     * 依次写入新 <hash>.js、registry 和 atom，最后等待旧源码文件删除；提交失败时保留原插件
     */
    async #commitInstall(
        source: string,
        srcUrl?: string,
        updateTarget?: string,
        skipIfInstalled = false,
    ): Promise<InstallResult> {
        // 更新专用：目标在提交时已被卸载 → 跳过，连源码都不编译执行（不复活）
        if (updateTarget !== undefined && !this.#meta.getMeta(updateTarget)) {
            return { ok: true, platform: updateTarget, skipped: true };
        }
        let definition;
        let supportedMethods: string[];
        try {
            ({ definition, supportedMethods } = compile(
                source,
                createSandboxEnv(() => ({})),
            ));
        } catch {
            return { ok: false, reason: 'parseError' };
        }

        const platform = definition.platform;
        // 保留 platform：插件源码不得占用内建「本地」
        if (isLocalPlatform(platform)) {
            return { ok: false, reason: 'invalid' };
        }
        // 更新专用：源码声明的插件与更新目标不符 → 视为无效更新，不误动别的插件
        if (updateTarget !== undefined && platform !== updateTarget) {
            return { ok: false, reason: 'invalid' };
        }

        const existing = this.#meta.getMeta(platform);
        // 仅当不存在才装（恢复恒增量用）：platform 已被任何来源占用 → 跳过，绝不替换现有插件
        // 早于 appVersion / hash：占用即跳过，不因版本不兼容等再误判成失败
        if (skipIfInstalled && existing) {
            return { ok: true, platform, skipped: true };
        }

        // 插件要求的 App 版本不满足 → 拒装（开关开则放行）
        if (
            !(this.#config.get('plugin.ignoreAppVersion') ?? false) &&
            this.#appVersionMismatch(definition.appVersion)
        ) {
            return { ok: false, reason: 'versionMismatch' };
        }

        const hash = CryptoJS.SHA256(source).toString();
        // 幂等：同 platform 同源码 → 已装，不重写盘
        if (existing && existing.hash === hash) {
            // 若此前卸载在删注册表处失败留了删除意图，这里撤销（插件其实还在）
            this.#clearTombstone([existing.file]);
            return { ok: true, platform, alreadyInstalled: true };
        }
        // 降级拦截：已装版本更新 → 拒装（开关开则放行）
        if (
            !(this.#config.get('basic.notCheckPluginVersion') ?? false) &&
            existing &&
            this.#isNewer(existing.version, definition.version)
        ) {
            return { ok: false, reason: 'olderVersion' };
        }

        const file = `${hash}.js`;
        try {
            await this.#store.save(file, source);
        } catch {
            return { ok: false, reason: 'invalid' };
        }
        // 撤销该文件的删除意图，且必须在写注册表之前：崩溃恢复时「重装」优先于「旧卸载」
        // （文件在、注册表未写、无待删标记 → 启动对账收养恢复；若留着标记会被误当未完成的卸载删掉）
        this.#clearTombstone([file]);

        const record = this.#buildRecord(
            file,
            hash,
            definition,
            supportedMethods,
            srcUrl,
        );
        if (!this.#persistRecord(platform, record)) {
            // 写注册表失败：恢复删除意图再删文件，别留下会被收养的孤儿
            this.#addTombstone([file]);
            await this.#deleteTombstoned([file]);
            return { ok: false, reason: 'invalid' };
        }
        this.#publish(platform, this.#createPlugin(platform, record));

        // 同一 platform 更新源码后删除旧 hash 文件；await 保证删除完成后才处理后续提交，避免误删被重新引用的文件
        if (existing?.file && existing.file !== file) {
            await this.#store.remove(existing.file).catch(() => {});
        }
        return { ok: true, platform };
    }

    // —— 卸载 ——

    async uninstall(platform: string): Promise<void> {
        await this.#ready;
        return this.#enqueueCommit(() => this.#commitUninstall(platform));
    }

    async #commitUninstall(platform: string): Promise<void> {
        const record = this.#meta.getMeta(platform);
        // 先把删除意图落盘（在删注册表之前）：崩了也能靠清单补完卸载、不被启动对账收养
        if (record?.file) {
            this.#addTombstone([record.file]);
        }
        // 从 live 列表与注册表移除（保留 order/disabled/userVars/alt，重装恢复偏好）
        const next = new Map(getPlugins());
        next.delete(platform);
        setPlugins(next);
        this.#meta.removeMeta(platform);
        if (record?.file) {
            await this.#deleteTombstoned([record.file]);
        }
    }

    async uninstallMany(platforms: string[]): Promise<void> {
        await this.#ready;
        return this.#enqueueCommit(() => this.#commitUninstallMany(platforms));
    }

    /** 批量卸载：一次性移除全部选中项，只发布一次列表更新（保留偏好，同单个卸载） */
    async #commitUninstallMany(platforms: string[]): Promise<void> {
        const files: string[] = [];
        for (const platform of platforms) {
            const record = this.#meta.getMeta(platform);
            if (record?.file) {
                files.push(record.file);
            }
        }
        // 先把删除意图落盘（在删注册表之前，抗中断）
        this.#addTombstone(files);
        const next = new Map(getPlugins());
        for (const platform of platforms) {
            next.delete(platform);
            this.#meta.removeMeta(platform);
        }
        setPlugins(next);
        await this.#deleteTombstoned(files);
    }

    /** 记删除意图：把文件加入待删清单并落盘（删注册表前调，抗中断） */
    #addTombstone(files: string[]): void {
        if (files.length === 0) {
            return;
        }
        const next = new Set(this.#meta.getTombstone());
        for (const file of files) {
            next.add(file);
        }
        this.#meta.setTombstone([...next]);
    }

    /** 撤销删除意图：从待删清单移除（删文件成功、或文件被重装引用时调） */
    #clearTombstone(files: string[]): void {
        if (files.length === 0) {
            return;
        }
        const remove = new Set(files);
        const current = this.#meta.getTombstone();
        const next = current.filter(file => !remove.has(file));
        if (next.length !== current.length) {
            this.#meta.setTombstone(next);
        }
    }

    /** 删除待删文件，删成功的划掉；删失败的留着，下次启动再试 */
    async #deleteTombstoned(files: string[]): Promise<void> {
        const cleared: string[] = [];
        for (const file of files) {
            try {
                await this.#store.remove(file);
                cleared.push(file);
            } catch {
                // 删除失败：留在待删清单，下次启动对账重试
            }
        }
        this.#clearTombstone(cleared);
    }

    // —— 查询 ——

    getAll(): Plugin[] {
        return [...getPlugins().values()];
    }

    getByPlatform(platform: string): Plugin | undefined {
        if (isLocalPlatform(platform)) {
            return localPlugin;
        }
        return getPlugins().get(platform);
    }

    getByMediaItem(item: MediaBase): Plugin | undefined {
        return this.getByPlatform(item.platform);
    }

    getSearchablePlugins(type?: MediaType): Plugin[] {
        const plugins = getPlugins();
        // 一次性读禁用表，避免逐插件 MMKV 读；getPlugins 已排除内建本地
        const disabled = new Set(this.#meta.getDisabled());
        // 复用 getOrder 排序；只留启用 + 有 search 能力 +（给了 type 则支持该类型，未声明 = 支持全部）
        return this.getOrder()
            .map(platform => plugins.get(platform))
            .filter(
                (plugin): plugin is Plugin =>
                    plugin !== undefined &&
                    !disabled.has(plugin.platform) &&
                    plugin.supportedMethods.has('search') &&
                    (type === undefined ||
                        plugin.supportedSearchTypes === undefined ||
                        plugin.supportedSearchTypes.includes(type)),
            );
    }

    // —— 启用 ——

    isEnabled(platform: string): boolean {
        // 内建本地插件恒可用
        if (isLocalPlatform(platform)) {
            return true;
        }
        return this.#meta.isEnabled(platform);
    }

    setEnabled(platform: string, enabled: boolean): void {
        this.#meta.setEnabled(platform, enabled);
    }

    // —— 排序（wire 存 Record，API 用有序 platform 数组）——

    getOrder(): string[] {
        const order = this.#meta.getOrderRecord();
        // 已装插件按 order 值升序；无 order 的（新装）排末尾、保持插入序（MAX_SAFE_INTEGER 相减为 0，sort 稳定）
        const rank = (p: string) => order[p] ?? Number.MAX_SAFE_INTEGER;
        return [...getPlugins().keys()].sort((a, b) => rank(a) - rank(b));
    }

    setOrder(platforms: string[]): void {
        // merge：保留已卸载 platform 的历史 order（重装恢复），只覆盖传入的
        const order = { ...this.#meta.getOrderRecord() };
        platforms.forEach((platform, index) => {
            order[platform] = index;
        });
        this.#meta.setOrderRecord(order);
    }

    // —— 用户变量 / 替代源 ——

    getUserVariables(platform: string): Record<string, string> {
        return this.#meta.getUserVariables(platform);
    }

    setUserVariables(platform: string, vars: Record<string, string>): void {
        this.#meta.setUserVariables(platform, vars);
    }

    getAlternative(platform: string): string | null {
        return this.#meta.getAlternative(platform);
    }

    setAlternative(platform: string, altPlatform: string | null): void {
        this.#meta.setAlternative(platform, altPlatform);
    }

    // —— 订阅 / 更新 / 启动：2c ——

    /**
     * 启动时同步注册表、源码文件和 live 列表；无论成功与否都解除 ready 屏障
     * 启动期间触发的安装和卸载会等待同步完成，避免其 atom 更新被全量发布覆盖
     */
    async setup(): Promise<void> {
        try {
            await this.#reconcile();
            this.#reconcileOk = true;
        } finally {
            this.#markReady();
            this.#watchAppVersionGate();
        }
    }

    /**
     * App 兼容闸的开关是运行时可改的，而判定结果烘焙在 Plugin 实例里（判死的实例永久 error、不编译）
     * 不重建的话，用户关掉检查后被判死的插件依旧是死的，非重启不可
     * 单例常驻，退订函数不保留；重建走提交链，避免与进行中的安装 / 卸载抢 atom
     */
    #watchAppVersionGate(): void {
        this.#config.subscribe(['plugin.ignoreAppVersion'], () => {
            this.#enqueueCommit(async () => this.#rebuildVersionGated()).catch(
                () => undefined,
            );
        });
    }

    /**
     * 按当前开关重算各插件的 App 兼容判定，只替换判定翻转的那几个
     * 不整体重建：换掉实例等于丢弃它的惰性编译结果，没翻转的插件没有理由陪绑
     * 只认 live 列表里已有的插件——注册表有而列表没有（对账中途失败等）属于对账的职责，
     * 兼容闸顺手「复活」它们只会拼出一份残缺列表
     */
    #rebuildVersionGated(): void {
        const ignoreAppVersion =
            this.#config.get('plugin.ignoreAppVersion') ?? false;
        const current = getPlugins();
        const next = new Map(current);
        let changed = false;
        for (const [platform, record] of this.#meta.getAllMeta()) {
            const existing = current.get(platform);
            if (!existing) {
                continue;
            }
            const mismatch =
                !ignoreAppVersion &&
                this.#appVersionMismatch(record.appVersion);
            if (mismatch !== (existing.errorReason === 'versionMismatch')) {
                next.set(
                    platform,
                    this.#createPlugin(platform, record, mismatch),
                );
                changed = true;
            }
        }
        if (changed) {
            setPlugins(next);
        }
    }

    /**
     * 启动对账：关键段（阻塞、bootstrap await、产出可用列表）
     * 剔除失踪条目 → 陌生文件编译补注册表 / platform 冲突留高版本 → 建列表 + 填 atom
     * 清理段（删冲突败者 / 待删清单）延后到首屏后低优先级异步
     */
    async #reconcile(): Promise<void> {
        const files = new Set(
            (await this.#store.list()).filter(file => file.endsWith('.js')),
        );
        const registry = this.#meta.getAllMeta();
        const tombstone = new Set(this.#meta.getTombstone());

        // 剔除注册表里指向已消失文件的条目
        for (const [platform, record] of registry) {
            if (!files.has(record.file)) {
                this.#meta.removeMeta(platform);
                registry.delete(platform);
            }
        }
        // 补完中断的卸载：注册表仍指向待删文件（删了文件名却没删成注册表就崩了）→ 一并移除
        for (const [platform, record] of registry) {
            if (tombstone.has(record.file)) {
                this.#meta.removeMeta(platform);
                registry.delete(platform);
            }
        }
        const referenced = new Set(
            [...registry.values()].map(record => record.file),
        );

        // 陌生文件：编译补注册表 / platform 冲突留高版本 / 未被采纳（编译失败或注册表写不进）入待删
        const loserFiles: string[] = [];
        const quarantineFiles: string[] = [];
        for (const file of files) {
            if (referenced.has(file)) {
                continue;
            }
            // 待删清单上的孤儿文件：绝不收养，留给清理段删除
            if (tombstone.has(file)) {
                continue;
            }
            let platform: string;
            let record: PluginMetaRecord;
            try {
                const source = await this.#store.read(file);
                const hash = CryptoJS.SHA256(source).toString();
                const { definition, supportedMethods } = compile(
                    source,
                    createSandboxEnv(() => ({})),
                );
                platform = definition.platform;
                if (isLocalPlatform(platform)) {
                    quarantineFiles.push(file);
                    continue;
                }
                record = this.#buildRecord(
                    file,
                    hash,
                    definition,
                    supportedMethods,
                );
            } catch {
                quarantineFiles.push(file);
                continue;
            }
            const existing = registry.get(platform);
            if (!existing) {
                if (this.#persistRecord(platform, record)) {
                    registry.set(platform, record);
                } else {
                    quarantineFiles.push(file);
                }
            } else if (this.#isNewer(record.version, existing.version)) {
                // 新的赢：先确认新 record 落盘，再把旧文件列入待删
                if (this.#persistRecord(platform, record)) {
                    loserFiles.push(existing.file);
                    registry.set(platform, record);
                } else {
                    quarantineFiles.push(file);
                }
            } else {
                loserFiles.push(file);
            }
        }

        // 建 Plugin 列表 + 填 atom（免编译从缓存 appVersion 判 versionMismatch）
        // 开关在这里读而非方法开头：读取与 setPlugins 之间不留 await，
        // 否则对账期间翻开关会既用不上新值、又赶不上订阅装好（订阅不回放当前值）
        const ignoreAppVersion =
            this.#config.get('plugin.ignoreAppVersion') ?? false;
        const plugins = new Map<string, Plugin>();
        for (const [platform, record] of registry) {
            const versionMismatch =
                !ignoreAppVersion &&
                this.#appVersionMismatch(record.appVersion);
            plugins.set(
                platform,
                this.#createPlugin(platform, record, versionMismatch),
            );
        }
        setPlugins(plugins);

        this.#scheduleCleanup(loserFiles, quarantineFiles);
    }

    async update(platform: string): Promise<InstallResult> {
        await this.#ready;
        const record = this.#meta.getMeta(platform);
        if (!record?.srcUrl) {
            return { ok: false, reason: 'invalid' };
        }
        return this.#installOneFromUrl(record.srcUrl, platform);
    }

    async updateAll(): Promise<InstallResult[]> {
        await this.#ready;
        const jobs = this.getAll().flatMap(plugin =>
            plugin.srcUrl
                ? [{ url: plugin.srcUrl, updateTarget: plugin.platform }]
                : [],
        );
        return this.#installMany(jobs);
    }

    /** 更新选中的插件：仅重装带 srcUrl 的选中项，无源的静默跳过 */
    async updateMany(platforms: string[]): Promise<InstallResult[]> {
        await this.#ready;
        const selected = new Set(platforms);
        const jobs = this.getAll().flatMap(plugin =>
            selected.has(plugin.platform) && plugin.srcUrl
                ? [{ url: plugin.srcUrl, updateTarget: plugin.platform }]
                : [],
        );
        return this.#installMany(jobs);
    }

    async autoUpdate(): Promise<void> {
        try {
            // 开关判定在 ready 之前：关着时不必等启动对账，直接返回
            if (!(this.#config.get('basic.autoUpdatePlugin') ?? false)) {
                return;
            }
            await this.#ready;
            // 对账没成功时注册表不可信，这轮什么都不做、也不记账（等下次冷启重试）
            if (!this.#reconcileOk) {
                return;
            }
            const now = Date.now();
            const last = this.#meta.getLastAutoUpdateAttemptAt();
            // 取绝对值：设备时钟被调到未来又校回来时，负差值不该把自动更新长期锁死
            if (Math.abs(now - last) < AUTO_UPDATE_INTERVAL_MS) {
                return;
            }
            // 先记账再干活：这轮失败也等下一个周期，免没网时每次冷启都白打一轮请求
            this.#meta.setLastAutoUpdateAttemptAt(now);
            // 一次性读禁用表，避免逐插件 MMKV 读
            const disabled = new Set(this.#meta.getDisabled());
            const enabled = this.getAll().flatMap(plugin =>
                disabled.has(plugin.platform) ? [] : [plugin.platform],
            );
            await this.updateMany(enabled);
        } catch (e) {
            // 静默：启动期的后台任务，成败都不打扰用户
            // 网络失败已在 #fetchSource 转成 InstallResult，落到这里的多半是自身缺陷
            if (__DEV__) {
                console.warn('[plugin] 自动更新异常', e);
            }
        }
    }

    getSubscriptions(): SubscribeSource[] {
        // config.get 类型是 SubscribeSource[]，但升级用户存的是 legacy 字符串——用 unknown 兜住迁移期
        const raw: unknown = this.#config.get('plugin.subscribeUrl');
        if (Array.isArray(raw)) {
            return raw as SubscribeSource[];
        }
        // @deprecated legacy 双重编码字符串 / 极旧裸 URL；读兼容，下次 setSubscriptions 写成干净数组自动迁移
        if (typeof raw === 'string' && raw.length > 0) {
            const parsed = safeParse<SubscribeSource[]>(raw);
            return Array.isArray(parsed) ? parsed : [{ name: raw, url: raw }];
        }
        return [];
    }

    setSubscriptions(sources: SubscribeSource[]): void {
        // 干净存储：直接写数组，config 层单层 JSON 化（甩掉 legacy 双重编码）
        this.#config.set('plugin.subscribeUrl', sources);
    }

    async updateFromSubscriptions(): Promise<InstallResult[]> {
        await this.#ready;
        const results: InstallResult[] = [];
        for (const source of this.getSubscriptions()) {
            results.push(...(await this.installFromUrl(source.url)));
        }
        return results;
    }

    // —— 备份传输：快照侧 ——

    /**
     * 一致快照插件段（installed 按 order 排、按 srcUrl 去重、不含用户变量），供 core/backup 备份
     * 只记有 http(s) srcUrl 的插件——本地文件装的无源、内建 local 均不可重装，略去=协议已认的可接受损失
     */
    async snapshotPlugins(): Promise<PluginsTransfer> {
        await this.#ready;
        // 对账失败 = 注册表不可信：拒绝，避免产出会误导的残缺插件段
        if (!this.#reconcileOk) {
            throw new Error('插件注册表未就绪，无法快照插件段');
        }
        // installed：按 order 排、仅 http(s) srcUrl（本地文件 / 非 http 源不可重装）、按 srcUrl 去重
        const installed: InstalledPluginTransfer[] = [];
        const seenSrc = new Set<string>();
        for (const platform of this.getOrder()) {
            const plugin = this.getByPlatform(platform);
            const srcUrl = plugin?.srcUrl;
            if (srcUrl && looksLikeHttpUrl(srcUrl) && !seenSrc.has(srcUrl)) {
                seenSrc.add(srcUrl);
                installed.push({
                    srcUrl,
                    version: plugin?.version,
                    enabled: this.isEnabled(platform),
                });
            }
        }
        // subscriptions：仅 http(s)、按 url 去重（保首项、保序）
        const subscriptions: SubscribeSource[] = [];
        const seenUrl = new Set<string>();
        for (const source of this.getSubscriptions()) {
            if (looksLikeHttpUrl(source.url) && !seenUrl.has(source.url)) {
                seenUrl.add(source.url);
                subscriptions.push(source);
            }
        }
        // alternatives：全量（含已卸载 platform 保留的偏好，仍影响历史媒体解析），按 platform 排序求确定序
        const alternatives: PluginAlternativeTransfer[] = [
            ...this.#meta.getAllAlternatives(),
        ]
            .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
            .map(([platform, alternativePlatform]) => ({
                platform,
                alternativePlatform,
            }));
        return { installed, subscriptions, alternatives };
    }

    /**
     * 恢复插件段到本机：纯加法、恒增量（绝不卸载）、best-effort
     * installed 已装（同 srcUrl，或装出的 platform 已被占）即跳过、不替换、不动其现有配置；
     * 仅真正新装的才套备份 enabled，无历史排名的按恢复顺序追加并持久化；
     * subscriptions / alternatives 只加新的、保留现有；失败逐条计入不阻断
     */
    async restorePlugins(
        input: PluginsTransfer,
    ): Promise<PluginsRestoreResult> {
        await this.#ready;
        // 对账失败时注册表不可信：认不出磁盘现有插件、恢复会误重装 / 替换它们
        // 与 snapshotPlugins 对称，整段拒绝而非在不可信态动副作用
        if (!this.#reconcileOk) {
            throw new Error('插件注册表未就绪，无法恢复插件段');
        }
        let pluginsInstalled = 0;
        let pluginsSkipped = 0;
        const pluginInstallFailures: PluginInstallFailure[] = [];
        const installedSrc = new Set(
            this.getAll()
                .map(plugin => plugin.srcUrl)
                .filter((url): url is string => url !== undefined),
        );
        for (const entry of input.installed) {
            // 快速路径：同 srcUrl 已装 → 跳过、免联网
            if (installedSrc.has(entry.srcUrl)) {
                pluginsSkipped += 1;
                continue;
            }
            installedSrc.add(entry.srcUrl);
            let result: InstallResult;
            try {
                // skipIfInstalled：装出的 platform 已被占（不同 srcUrl / 同源）→ 跳过、不替换现有
                result = await this.#installOneFromUrl(
                    entry.srcUrl,
                    undefined,
                    true,
                );
            } catch {
                // 网络错已在 #fetchSource 转成 InstallResult；逃到此处的是存储 / 内部异常
                pluginInstallFailures.push({
                    srcUrl: entry.srcUrl,
                    reason: 'unexpected',
                });
                continue;
            }
            if (!result.ok) {
                pluginInstallFailures.push({
                    srcUrl: entry.srcUrl,
                    reason: result.reason,
                });
            } else if (result.skipped) {
                // platform 已占：跳过，不套用备份 enabled（不动本机现有插件配置）
                pluginsSkipped += 1;
            } else {
                pluginsInstalled += 1;
                this.setEnabled(result.platform, entry.enabled);
                const order = { ...this.#meta.getOrderRecord() };
                let nextRank =
                    Object.values(order).reduce(
                        (maximum, rank) => Math.max(maximum, rank),
                        -1,
                    ) + 1;
                let changed = false;
                for (const platform of this.getOrder()) {
                    if (order[platform] === undefined) {
                        order[platform] = nextRank;
                        nextRank += 1;
                        changed = true;
                    }
                }
                if (changed) {
                    this.#meta.setOrderRecord(order);
                }
            }
        }

        // subscriptions：按 url 合并，已有保留、只加新
        const existingSubs = this.getSubscriptions();
        const seenUrl = new Set(existingSubs.map(source => source.url));
        const addedSubs: SubscribeSource[] = [];
        let subscriptionsSkipped = 0;
        for (const source of input.subscriptions) {
            if (seenUrl.has(source.url)) {
                subscriptionsSkipped += 1;
            } else {
                seenUrl.add(source.url);
                addedSubs.push({ name: source.name, url: source.url });
            }
        }
        if (addedSubs.length > 0) {
            this.setSubscriptions([...existingSubs, ...addedSubs]);
        }

        // alternatives：按 platform，已设保留、只加新
        let alternativesAdded = 0;
        let alternativesSkipped = 0;
        for (const alt of input.alternatives) {
            if (this.getAlternative(alt.platform) !== null) {
                alternativesSkipped += 1;
            } else {
                this.setAlternative(alt.platform, alt.alternativePlatform);
                alternativesAdded += 1;
            }
        }

        return {
            pluginsInstalled,
            pluginsSkipped,
            pluginInstallFailures,
            subscriptionsAdded: addedSubs.length,
            subscriptionsSkipped,
            alternativesAdded,
            alternativesSkipped,
        };
    }

    // —— 内部 ——

    #buildRecord(
        file: string,
        hash: string,
        definition: PluginDefinition,
        supportedMethods: string[],
        srcUrl?: string,
    ): PluginMetaRecord {
        return {
            file,
            hash,
            version: definition.version,
            author: definition.author,
            description: definition.description,
            srcUrl: srcUrl ?? definition.srcUrl,
            appVersion: definition.appVersion,
            supportedMethods,
            // raw 存（可含 legacy 'sheet'），归一化留 2d 调用边界
            defaultSearchType: definition.defaultSearchType,
            supportedSearchTypes: definition.supportedSearchType,
            userVariables: definition.userVariables,
        };
    }

    /** 写注册表 + 读回校验：序列化静默跳过（不可信插件数据）/ 写入抛错都返 false */
    #persistRecord(platform: string, record: PluginMetaRecord): boolean {
        try {
            this.#meta.setMeta(platform, record);
        } catch {
            // 抛错交读回校验
        }
        return this.#meta.getMeta(platform)?.hash === record.hash;
    }

    /**
     * 批量安装插件 URL：并发获取源码，再按输入顺序串行提交
     * 编译、写盘、更新 registry 和 atom、删除旧文件均不并发，避免同一 platform 的提交相互覆盖
     */
    async #installMany(jobs: InstallJob[]): Promise<InstallResult[]> {
        const fetched = await mapConcurrent(jobs, FETCH_CONCURRENCY, job =>
            this.#fetchSource(job.url),
        );
        const results: InstallResult[] = [];
        for (let i = 0; i < jobs.length; i += 1) {
            const item = fetched[i];
            const job = jobs[i];
            if (item === undefined || job === undefined) {
                continue;
            }
            results.push(
                item.ok
                    ? await this.#install(
                          item.source,
                          job.url,
                          job.updateTarget,
                      )
                    : item,
            );
        }
        return results;
    }

    /** 从远程 .js URL 安装单个插件 */
    async #installOneFromUrl(
        url: string,
        updateTarget?: string,
        skipIfInstalled = false,
    ): Promise<InstallResult> {
        const fetched = await this.#fetchSource(url);
        return fetched.ok
            ? this.#install(fetched.source, url, updateTarget, skipIfInstalled)
            : fetched;
    }

    /**
     * 获取插件源码 / 订阅清单文本并把失败转成结果：请求异常为 network（带状态码 / 超时线索）、空正文为 invalid、
     * 拿回网页为 notPluginSource。所有取源路径（单装、清单批量装、订阅同步、更新、恢复）都经这里，
     * 网页判定放在此处才不会漏掉 .json 地址与清单子项
     */
    async #fetchSource(url: string): Promise<FetchedSource> {
        let source: string;
        try {
            source = await this.#fetchText(url);
        } catch (e) {
            return {
                ok: false,
                reason: 'network',
                detail: describeFetchError(e),
            };
        }
        if (!source) {
            return { ok: false, reason: 'invalid' };
        }
        // 贴了 GitHub 网页链接而非 raw 直链、或 CDN / 运营商错误页：单独报，别混进「解析失败」
        if (looksLikeHtmlDocument(source)) {
            return { ok: false, reason: 'notPluginSource' };
        }
        return { ok: true, source };
    }

    /** 获取插件源码或订阅清单文本；附加时间戳 query 参数绕过 CDN 缓存，并设置请求超时 */
    async #fetchText(url: string): Promise<string> {
        const sep = url.includes('?') ? '&' : '?';
        const res = await axios.get<string>(`${url}${sep}_=${Date.now()}`, {
            responseType: 'text',
            timeout: FETCH_TIMEOUT_MS,
        });
        return res.data;
    }

    /** 取 path 段判扩展名，避免 ?query/#fragment 干扰（对 URL 与本地路径都成立） */
    #isJsonSource(urlOrPath: string): boolean {
        const path = urlOrPath.split(/[?#]/)[0] ?? '';
        return path.toLowerCase().endsWith('.json');
    }

    /**
     * 解析订阅清单 JSON：{ plugins: [{ url }] } → url 列表
     * 不是 JSON、或 JSON 里没有 plugins 数组，都返 null（= 这不是一份清单）；空数组是合法的空清单
     */
    #parsePluginUrls(jsonText: string): string[] | null {
        const data = safeParse<{ plugins?: { url?: string }[] }>(jsonText);
        if (data === undefined || !Array.isArray(data?.plugins)) {
            return null;
        }
        return data.plugins
            .map(entry => entry?.url)
            .filter((url): url is string => !!url);
    }

    /** 插件要求的 App 版本 vs 当前 App；不满足=true（范围非法则宽容返 false） */
    #appVersionMismatch(range?: string): boolean {
        if (!range) {
            return false;
        }
        try {
            return !satisfies(appVersion, range);
        } catch {
            return false;
        }
    }

    /** a 是否严格新于 b（缺失/非法版本 → false） */
    #isNewer(a?: string, b?: string): boolean {
        if (!a || !b) {
            return false;
        }
        try {
            return compareVersions(a, b) > 0;
        } catch {
            return false;
        }
    }

    #createPlugin(
        platform: string,
        record: PluginMetaRecord,
        versionMismatch = false,
    ): PluginImpl {
        return new PluginImpl(
            platform,
            record,
            {
                readSource: file => this.#store.read(file),
                getUserVariables: () => this.#meta.getUserVariables(platform),
            },
            versionMismatch
                ? { state: 'error', errorReason: 'versionMismatch' }
                : undefined,
        );
    }

    /**
     * 清理段：首屏后延后低优先级，不占启动关键路径；幂等、可中断（中断下轮再收）
     * 删除前按当前注册表重算引用，避免误删窗口内被重装的文件
     */
    #scheduleCleanup(loserFiles: string[], quarantineFiles: string[]): void {
        // 首屏后延后清理；走 infra/timer 背景模式，切后台也可靠触发（进程存活期间），不占启动关键路径
        delay(CLEANUP_DELAY_MS, { runInBackground: true })
            .then(() =>
                this.#enqueueCommit(() =>
                    this.#runCleanup(loserFiles, quarantineFiles),
                ),
            )
            .catch(() => {});
    }

    /** 在串行提交链中执行清理：重新计算 registry 引用并等待删除完成，避免误删清理期间被重新引用的文件 */
    async #runCleanup(
        loserFiles: string[],
        quarantineFiles: string[],
    ): Promise<void> {
        const referenced = new Set(
            [...this.#meta.getAllMeta().values()].map(r => r.file),
        );
        for (const file of loserFiles) {
            if (!referenced.has(file)) {
                await this.#store.remove(file).catch(() => {});
            }
        }
        await this.#reconcileQuarantine(quarantineFiles, referenced);
        await this.#reconcileTombstone(referenced);
    }

    /** 待删清单对账：未被采纳的陌生文件（编译失败/注册表写不进）记时留着，超保留期才删（删成功才清计时）；复活则清项 */
    async #reconcileQuarantine(
        quarantineFiles: string[],
        referenced: Set<string>,
    ): Promise<void> {
        const ledger = this.#meta.getQuarantine();
        const now = Date.now();
        const stillBad = new Set(quarantineFiles);
        // 不再坏（复活/消失）→ 清项
        for (const file of Object.keys(ledger)) {
            if (!stillBad.has(file)) {
                delete ledger[file];
            }
        }
        for (const file of quarantineFiles) {
            // 窗口内被重装/引用 → 跳过，别删
            if (referenced.has(file)) {
                continue;
            }
            const firstBadAt = ledger[file];
            if (firstBadAt == null) {
                ledger[file] = now;
            } else if (now - firstBadAt > QUARANTINE_RETENTION_MS) {
                try {
                    await this.#store.remove(file);
                    delete ledger[file];
                } catch {
                    // 删除失败：保留 firstBadAt，下轮再试，不重置计时
                }
            }
        }
        this.#meta.setQuarantine(ledger);
    }

    /** 卸载待删清单清理：删掉仍在磁盘、且未被重装引用的待删文件；已消失或被引用的清项 */
    async #reconcileTombstone(referenced: Set<string>): Promise<void> {
        const tombstone = this.#meta.getTombstone();
        if (tombstone.length === 0) {
            return;
        }
        const onDisk = new Set(
            (await this.#store.list()).filter(file => file.endsWith('.js')),
        );
        const cleared: string[] = [];
        for (const file of tombstone) {
            // 已不在磁盘 / 被重装引用 → 撤销待删
            if (!onDisk.has(file) || referenced.has(file)) {
                cleared.push(file);
                continue;
            }
            try {
                await this.#store.remove(file);
                cleared.push(file);
            } catch {
                // 删除失败：留着，下次启动再试
            }
        }
        this.#clearTombstone(cleared);
    }

    /** 换整表发布（禁原地 mutate；成员/身份层反应式） */
    #publish(platform: string, plugin: Plugin): void {
        const next = new Map(getPlugins());
        next.set(platform, plugin);
        setPlugins(next);
    }
}

/** 裸对象 live-binding，UX / 其他 core 经此用；由 app/container 装配 */
export let pluginManager: IPluginManager;

/** 仅 app/container 调：装配 pluginManager 单例 */
export function providePluginManager(instance: IPluginManager): void {
    pluginManager = instance;
}

export {
    usePlugins,
    useSearchablePlugins,
    usePluginsWithMethods,
    usePluginEnabled,
    usePluginUserVariables,
    usePluginAlternative,
    usePlugin,
} from './hooks';

export { capabilitiesOf } from './capabilities';

export { pluginQueryKey } from './queryKeys';

export type {
    IPluginManager,
    IPluginTransfer,
    Plugin,
    InstallFailure,
    InstallResult,
    InstalledPluginTransfer,
    PluginAlternativeTransfer,
    PluginInstallFailure,
    PluginInstallFailureReason,
    PluginsRestoreResult,
    PluginsTransfer,
    SubscribeSource,
    PluginMethodName,
} from './types';

export type { PluginCapability } from './capabilities';
