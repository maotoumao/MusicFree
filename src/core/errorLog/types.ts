import type { IPluginManager } from '@/core/plugin';

/**
 * 错误日志的持久化契约
 * 新 store、无 legacy 包袱；记录是诊断材料而非用户数据，丢了不影响任何功能
 */
export const ERROR_LOG_STORE_ID = 'music.ErrorLog';
export const ERROR_LOG_KEY = 'records';

/** 上限 10 条：太少了用户想起来时已被冲掉，太多了没有诊断价值 */
export const MAX_ERROR_RECORDS = 10;

/**
 * 单条记录里两段栈的字节上限；**只截尾部**
 * 头部帧是符号化最需要的，绝不能动
 */
export const MAX_STACK_CHARS = 8 * 1024;
export const MAX_COMPONENT_STACK_CHARS = 4 * 1024;
/**
 * 非 Error 抛出物字符串化后的上限
 * 插件可能抛整个 axios response——那里的 headers.Cookie 会逐字进报告，
 * 限长挡不住全部，但能把「整包配置泄出去」压成「一小段」
 */
export const MAX_NON_ERROR_CHARS = 512;

/** 重复错误的落盘限流窗口：计数在内存里累加，最多每秒落一次 */
export const REPEAT_PERSIST_INTERVAL_MS = 1000;

/**
 * 错误来源
 * - `render`：React 渲染期异常，由 ErrorBoundary 捕获，那棵子树已废
 * - `uncaught`：异步 / 事件回调里的未捕获异常，此时 React 树往往还好好的
 * - `localData`：本地数据（歌单、收藏）在启动装载 / 迁移时损坏或抛错，模块静默降级（只读、跳过损坏项）——
 *   用户看不到任何提示，日志是唯一痕迹
 */
export type ErrorSource = 'render' | 'uncaught' | 'localData';

/** 一条错误记录；`stack` 逐字保真，供离线 symbolicate */
export interface ErrorRecord {
    readonly id: string;
    readonly source: ErrorSource;
    readonly name: string;
    readonly message: string;
    /** 原样保留，不美化不折行；超长只截尾并追加标注 */
    readonly stack: string;
    readonly componentStack?: string;
    /** 出事时所在路由；用户之后会导航走，故必须在捕获当时快照 */
    readonly route?: string;
    /** 捕获当时已启用插件的 `platform version`，**不含任何变量值** */
    readonly plugins: readonly string[];
    readonly firstAt: number;
    readonly lastAt: number;
    /** 连续重复被合并进同一条的次数 */
    readonly count: number;
}

/** 上报入参；调用方只给错误本身，其余环境信息由 core 采集 */
export interface ErrorCapture {
    readonly source: ErrorSource;
    readonly error: unknown;
    readonly componentStack?: string;
}

/**
 * 错误日志端口
 *
 * 全程 best-effort：任何一步失败都吞掉——它是出错之后才跑的代码，
 * 自己再抛一次只会把原始错误盖掉
 */
export interface IErrorLog {
    /** 记录一次错误；连续重复只累加计数，不新增记录 */
    capture(input: ErrorCapture): void;
    /** 生成可直接粘贴的纯文本报告；id 不存在时返回 undefined */
    formatReport(id: string): string | undefined;
    /** 当前记录快照，newest-first */
    getRecords(): readonly ErrorRecord[];
    /** 清空 */
    clear(): void;
}

/** 环境信息注入而非直接读全局：报告里的版本 / 时间要能在测试里钉死 */
export interface ErrorLogEnvironment {
    readonly appVersion: string;
    readonly buildNumber: string;
    readonly os: string;
    readonly osVersion: string;
    readonly deviceModel: string;
    now(): number;
}

/** 构造 ErrorLog 所需的依赖 */
export interface ErrorLogDeps {
    /** 只用来快照已启用插件的 platform + version，用于判断是不是某个插件引起的 */
    pluginManager: IPluginManager;
    environment: ErrorLogEnvironment;
}
