/**
 * 下载引擎的 React-free 原生桥适配层，包裹裸 codegen spec（`./specs/NativeDownloadEngine`）
 * 仅负责枚举回填、事件解包、Promise 收口和 setup 默认值，不承载下载业务
 * 队列、并发、间隔、音源解析、registry、脱敏 tag 与通知文案由 core 负责
 * 业务代码统一从 `@/native/downloadEngine` 使用引擎，禁止直接 import `./specs`
 */
import Native from './specs/NativeDownloadEngine';

import type {
    ActiveDownload as SpecActiveDownload,
    CompletionReceipt,
    DownloadBeginEvent as SpecBeginEvent,
    DownloadCanceledEvent,
    DownloadCompleteEvent,
    DownloadErrorEvent as SpecErrorEvent,
    DownloadFinalizingEvent,
    DownloadPausedEvent,
    DownloadProgressEvent,
    DownloadRequest as SpecDownloadRequest,
    DownloadSetupOptions,
    NotificationActionEvent as SpecNotificationActionEvent,
    NotificationContext,
    StartAck,
} from './specs/NativeDownloadEngine';

// 不含回填字段的 DTO 直接 re-export，避免为 spec 建立第二份字段定义
export type {
    CompletionReceipt,
    DownloadCanceledEvent,
    DownloadCompleteEvent,
    DownloadFinalizingEvent,
    DownloadPausedEvent,
    DownloadProgressEvent,
    DownloadSetupOptions,
    DownloadTags,
    NotificationContext,
    StartAck,
} from './specs/NativeDownloadEngine';

/** 原生活动任务态；spec 跨桥使用裸 string，此处回填为语义 enum */
export enum DownloadState {
    /** 传输中 */
    Downloading = 'downloading',
    /** 已请求暂停，但 worker 尚未退出：仍占传输名额、仍会发事件，不可立即续传 */
    Pausing = 'pausing',
    /** worker 已退出、任务静止，`.part` 断点保留，此时才可续传 */
    Paused = 'paused',
    /** 定稿中：嗅探容器、写 tag 或发布 */
    Finalizing = 'finalizing',
}

/** 本次网络执行相对已有 `.part` 的处置结果 */
export enum DownloadDisposition {
    /** 全新下载 */
    Fresh = 'fresh',
    /** 从断点续传（服务端 206） */
    Resumed = 'resumed',
    /** 断点不可用，已截断从头下载 */
    Restarted = 'restarted',
}

/** 失败原因码；取消是独立终态，不使用此枚举 */
export enum DownloadErrorCode {
    /** 网络不可用 / 连接失败 / 传输中断 */
    Network = 'network',
    /** 服务端非 2xx（详见 httpStatus） */
    Http = 'http',
    /** 本地读写失败 */
    Io = 'io',
    /** 存储空间不足 */
    DiskFull = 'diskFull',
    /** 无写入权限 */
    Permission = 'permission',
    /** 入参非法（url / 路径 / 缺字段） */
    InvalidRequest = 'invalidRequest',
    /** 平台不支持（如 iOS 未实现） */
    Unsupported = 'unsupported',
    /** 超过并发硬上限被拒 */
    Capacity = 'capacity',
    /** 最终文件名已被占用（fail 撞名 / rename 候选耗尽） */
    TargetExists = 'targetExists',
    /** 服务端返回的不是音频（HTTP 200 但内容是错误页 / 风控提示等文本） */
    NotAudio = 'notAudio',
    /** 定稿阶段失败（嗅探 / 写 tag / 发布） */
    Finalize = 'finalize',
    /** 系统限制（如 Android dataSync FGS 超时） */
    SystemLimit = 'systemLimit',
    /** 未归类 */
    Unknown = 'unknown',
}

/** 失败发生的阶段，与 `DownloadErrorCode` 一起定位问题 */
export enum DownloadPhase {
    /** 建立连接或发起请求 */
    Connect = 'connect',
    /** 传输文件内容 */
    Transfer = 'transfer',
    /** 获取或处理封面 */
    Cover = 'cover',
    /** 嗅探容器、写入 tag 等定稿处理 */
    Finalize = 'finalize',
    /** 将文件发布为最终文件 */
    Publish = 'publish',
}

/** 最终文件名与磁盘已有文件冲突时的处置策略 */
export enum DownloadConflictStrategy {
    /** 报 targetExists 失败（默认，防误毁已有文件） */
    Fail = 'fail',
    /** 用新文件原子替换旧文件 */
    Overwrite = 'overwrite',
    /** 自动加后缀避让（`name (1).ext`） */
    Rename = 'rename',
}

/** 聚合通知按钮动作 */
export enum NotificationAction {
    /** 暂停全部活动任务 */
    PauseAll = 'pauseAll',
    /** 取消全部活动任务 */
    CancelAll = 'cancelAll',
}

/** 事件退订 */
export type Unsubscribe = () => void;

/**
 * 活动任务快照：以 spec 为字段单一真相源，仅将跨桥的 `state` 裸 string 回填为 enum
 */
export type ActiveDownload = Omit<SpecActiveDownload, 'state'> & {
    state: DownloadState;
};

/**
 * `onBegin` payload：以 spec 为字段单一真相源，仅将 `disposition` 回填为 enum
 */
export type DownloadBeginEvent = Omit<SpecBeginEvent, 'disposition'> & {
    disposition: DownloadDisposition;
};

/**
 * `onError` payload：以 spec 为字段单一真相源，仅将 `code` 和 `phase` 回填为 enum
 */
export type DownloadErrorEvent = Omit<SpecErrorEvent, 'code' | 'phase'> & {
    code: DownloadErrorCode;
    phase: DownloadPhase;
};

/**
 * `onNotificationAction` payload：以 spec 为字段单一真相源，仅将 `action` 回填为 enum
 */
export type NotificationActionEvent = Omit<
    SpecNotificationActionEvent,
    'action'
> & {
    action: NotificationAction;
};

/**
 * 启动请求：以 spec 为字段单一真相源，仅将 `conflictStrategy` 回填为 enum
 * 对外使用 enum，拼错字符串会在编译期失败；透传 native 时 enum value 等价于 wire string
 */
export type DownloadRequest = Omit<SpecDownloadRequest, 'conflictStrategy'> & {
    conflictStrategy?: DownloadConflictStrategy;
};

/** 当前平台是否提供下载引擎；目前仅 Android 实现，core/UI 据此隐藏不支持平台的入口 */
export const isDownloadEngineSupported = Native != null;

// 守卫：不支持的平台在调用时立即报错，避免等待永不到达的事件
function required(): NonNullable<typeof Native> {
    if (Native == null) {
        throw new Error('[DownloadEngine] 下载在当前平台不可用');
    }
    return Native;
}

/** setup 默认值；调用方只需传入要覆盖的字段 */
const DEFAULT_SETUP: DownloadSetupOptions = {
    progressIntervalMs: 500,
};

/**
 * 引擎把手：透传命令并将事件 payload 回填为 typed enum，再返回可调用的退订函数
 * 队列、并发、间隔、音源解析、registry、脱敏 tag 及通知文案均由 core/download 处理
 */
export const downloadEngine = {
    // —— 命令 ——

    /** 幂等初始化，并设置进度节流间隔等选项 */
    setup: (options?: Partial<DownloadSetupOptions>): Promise<void> =>
        required().setup({
            progressIntervalMs:
                options?.progressIntervalMs ?? DEFAULT_SETUP.progressIntervalMs,
        }),

    /** 统一处理启动、续传和重下，返回包含磁盘已有字节数的受理确认 */
    start: (request: DownloadRequest): Promise<StartAck> =>
        required().start(request),

    /** 暂停并保留 `.part`，再次 start 时续传 */
    pause: (taskId: string): Promise<void> => required().pause(taskId),

    /** 取消任务并清理 `.part` */
    cancel: (taskId: string): Promise<void> => required().cancel(taskId),

    /** 返回同进程活动任务快照，用于 App 回到前台时重连 */
    getActiveTasks: async (): Promise<ActiveDownload[]> =>
        (await required().getActiveTasks()) as ActiveDownload[],

    /** 返回尚未入账的终态完成回执，用于重连时重放 */
    getUnackedCompletions: (): Promise<CompletionReceipt[]> =>
        required().getUnackedCompletions(),

    /** 确认终态已入账，并幂等清除对应的磁盘回执 */
    ackCompletion: (taskId: string): void => required().ackCompletion(taskId),

    /** 更新聚合通知上下文（待下载数、等待原因、本地化文案） */
    setNotificationContext: (context: NotificationContext): void =>
        required().setNotificationContext(context),

    /**
     * 清理 downloadRoot 下 stagingKey 不在存活集合中的残留 `.part` 孤儿文件
     * 回没能清掉的候选数（0 = 干净）；调用方据此判断能不能信这个目录
     */
    cleanupOrphans: (
        downloadRoot: string,
        liveStagingKeys: string[],
    ): Promise<number> =>
        required().cleanupOrphans(downloadRoot, liveStagingKeys),

    // —— 事件：回填 typed payload，并返回退订函数 ——

    onBegin: (cb: (e: DownloadBeginEvent) => void): Unsubscribe => {
        const sub = required().onBegin(e =>
            cb({ ...e, disposition: e.disposition as DownloadDisposition }),
        );
        return () => sub.remove();
    },

    onProgress: (cb: (e: DownloadProgressEvent) => void): Unsubscribe => {
        const sub = required().onProgress(cb);
        return () => sub.remove();
    },

    onFinalizing: (cb: (e: DownloadFinalizingEvent) => void): Unsubscribe => {
        const sub = required().onFinalizing(cb);
        return () => sub.remove();
    },

    onComplete: (cb: (e: DownloadCompleteEvent) => void): Unsubscribe => {
        const sub = required().onComplete(cb);
        return () => sub.remove();
    },

    onError: (cb: (e: DownloadErrorEvent) => void): Unsubscribe => {
        const sub = required().onError(e =>
            cb({
                ...e,
                code: e.code as DownloadErrorCode,
                phase: e.phase as DownloadPhase,
            }),
        );
        return () => sub.remove();
    },

    onCanceled: (cb: (e: DownloadCanceledEvent) => void): Unsubscribe => {
        const sub = required().onCanceled(cb);
        return () => sub.remove();
    },

    onPaused: (cb: (e: DownloadPausedEvent) => void): Unsubscribe => {
        const sub = required().onPaused(cb);
        return () => sub.remove();
    },

    onNotificationAction: (
        cb: (e: NotificationActionEvent) => void,
    ): Unsubscribe => {
        const sub = required().onNotificationAction(e =>
            cb({ ...e, action: e.action as NotificationAction }),
        );
        return () => sub.remove();
    },
};
