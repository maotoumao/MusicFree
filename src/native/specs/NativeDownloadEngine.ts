import { TurboModuleRegistry, type TurboModule } from 'react-native';

import type { EventEmitter } from 'react-native/Libraries/Types/CodegenTypes';

/* 跨桥的枚举型字段一律用 string（codegen 对字面量 union 支持有限）；语义 enum 与完整取值见 JS 适配层 @/native/downloadEngine */

/**
 * 完成后要内嵌的 tag；封面由原生按 URL 拉取（限 2MiB、非图片跳过）
 * 实现：发布为最终文件后，复用 audiotags 的 TagLib 写引擎就地打 tag（其内部 staging + 原子替换保证安全），再发 onComplete
 */
export interface DownloadTags {
    /**
     * 大写 key、多值：标准 tag（TITLE / ARTIST / ALBUM…）+ 自定义 MF_MUSICITEM
     * MF_MUSICITEM = [脱敏版本化身份声明 JSON]：JS 侧只取身份与展示字段（allowlist），
     * url / headers / source / 签名 / 大段歌词等敏感与膨胀字段一律不写，并设字符上限
     */
    fields: { [key: string]: string[] };
    /** 远程封面图 URL；原生流式拉取，超过上限或拉取失败时跳过，不影响下载本身 */
    coverUrl?: string;
    /** 拉封面用的请求头 */
    coverHeaders?: { [key: string]: string };
}

/** 启动、续传和重下的统一入参；音源由 JS 每次解析新鲜直链后传入，目前只接受 progressive */
export interface DownloadRequest {
    /** 队列记录身份：由 JS 分配且跨 attempt 稳定的 opaque 值；不同于 MediaRef */
    taskId: string;
    /** 本次网络执行代次：JS 每次（重）启动分配、单调；所有事件 / 快照原样回带，JS 据此丢弃迟到的旧 attempt 事件 */
    attemptId: number;
    /** JS 生成的稳定字节身份，由 MediaRef、实际音质和来源变体组成；换音质或换源即使用不同 contentKey */
    contentKey: string;
    /** 本次解析得到的新鲜 progressive http(s) 直链；每次 start（包括续传和重试）都重新传入 */
    url: string;
    /** 请求头（鉴权 / 防盗链 / UA） */
    headers?: { [key: string]: string };
    /**
     * 落盘目录（规范化的绝对路径；原生确保存在）
     *
     * 默认是 app 私有目录，但用户可把它改到任意目录（见 `core/download` 的下载目录设置），
     * 故「同进程唯一写者」这个前提在自选的公共目录下**不再成立**：同名文件可能由别的应用
     * 或用户自己放进来。路径占用与发布原子性因此只在私有目录下是强保证；公共目录下
     * 由 reservedPaths + no-replace 落盘尽力避让（rename 策略会自增后缀），
     * 跨进程与路径别名仍不防（完整原子 no-replace 留 A4）
     */
    destDir: string;
    /** staging 临时文件名基（安全 hash，而非可能冲突的标题名）；`.part`、`.part.meta` 和 finalizing 副本均据此命名 */
    stagingKey: string;
    /** 最终发布文件名（不含扩展名）；扩展名由容器嗅探结果追加。fail/overwrite 下需同目录唯一，rename 下作为自增后缀的基名 */
    finalName: string;
    /**
     * 最终文件名被磁盘上已有文件占用时的处置（默认 fail）：fail 报 targetExists / overwrite 原子替换 / rename 加后缀避让；
     * 仅针对磁盘上的静态文件，两个同时活动的任务另按并发规则处理
     */
    conflictStrategy?: string;
    /** 完成后写入的 tag 和封面；省略时不写 tag，文件仍照常发布 */
    tags?: DownloadTags;
}

/** 引擎初始化选项 */
export interface DownloadSetupOptions {
    /** onProgress 最短间隔（毫秒，由原生节流；当前实现允许的下限为 250） */
    progressIntervalMs: number;
}

/** A4 聚合通知上下文；低频更新，语言变化时重推 texts */
export interface NotificationContext {
    /** JS 队列里还没 start 的待下载数（用于「下载中 N，另 M 排队」） */
    pendingCount: number;
    /** 等待原因文案（如「等待 WiFi」）；空串 = 无 */
    waitingText: string;
    /** 本地化通知文案（标题 / 进度 / 暂停 / 动作按钮等），由 JS 按当前语言下发 */
    texts: { [key: string]: string };
}

/** getActiveTasks 返回的活动任务快照（同进程重连用） */
export interface ActiveDownload {
    taskId: string;
    /** 该活动任务当前 attempt */
    attemptId: number;
    /**
     * 活动态：downloading / pausing / paused / finalizing
     * `pausing` 与 `paused` 必须分开看：前者已请求暂停但 worker 还在跑（仍会发事件），
     * 后者才是静止可续的。把前者当成已停会丢掉它后续的事件，任务就此卡死
     */
    state: string;
    downloadedBytes: number;
    /** 总字节，未知为 -1 */
    totalBytes: number;
}

/** start 的受理确认（网络请求前同步返回） */
export interface StartAck {
    taskId: string;
    attemptId: number;
    /** 磁盘上已有的 `.part` 字节（0 = 全新）；真实续传处置在 onBegin 定 */
    existingBytes: number;
}

/** 尚未被 JS 入账的终态完成回执；发 onComplete 前落盘、JS 入账后 ackCompletion 清除，杀进程时供 App 重启重放 */
export interface CompletionReceipt {
    taskId: string;
    /** 完成时的字节身份，供 JS 与队列比对 */
    contentKey: string;
    /** 最终文件绝对路径 */
    path: string;
    /** 实际容器扩展名（小写无点） */
    extension: string;
    sizeBytes: number;
    /** tag 是否全部写入（与 onComplete 一致，重放不丢该信息） */
    taggedOk: boolean;
}

/** onBegin：服务端已响应、本次处置确定 */
export interface DownloadBeginEvent {
    taskId: string;
    attemptId: number;
    /** 本次处置：fresh 全新 / resumed 续传 / restarted 服务端变化重下 */
    disposition: string;
    /** 完整文件总字节（206 取 Content-Range 总长、非本次响应长）；未知为 -1 */
    totalBytes: number;
}

/** onProgress：传输进度（原生按 progressIntervalMs 节流；已下字节按写盘成功计） */
export interface DownloadProgressEvent {
    taskId: string;
    attemptId: number;
    downloadedBytes: number;
    /** 总字节，未知为 -1 */
    totalBytes: number;
}

/** onFinalizing：后续定稿阶段进入嗅探、写 tag 或发布时发送，供 UI 显示「处理中」 */
export interface DownloadFinalizingEvent {
    taskId: string;
    attemptId: number;
}

/** onComplete：文件已发布为最终文件；扩展名由容器嗅探得出（回退 Content-Type/URL），tag 已内嵌 */
export interface DownloadCompleteEvent {
    taskId: string;
    attemptId: number;
    /** 完成时的字节身份 */
    contentKey: string;
    /** 最终文件绝对路径 */
    path: string;
    /** 扩展名（小写无点，如 m4a / mp3 / flac）：magic-byte 容器嗅探优先，识别不了回退 Content-Type / URL */
    extension: string;
    sizeBytes: number;
    /** tag 是否全部写入：未请求 tag 或全部（含封面）写入为 true；写入失败为 false 但不改变下载完成终态 */
    taggedOk: boolean;
}

/** onError：任务失败（终态；取消不走此列） */
export interface DownloadErrorEvent {
    taskId: string;
    attemptId: number;
    /** 错误码：network / http / io / diskFull / permission / invalidRequest / unsupported / capacity / targetExists / notAudio / finalize / systemLimit / unknown */
    code: string;
    /** 失败阶段：connect / transfer / cover / finalize / publish */
    phase: string;
    /** HTTP 状态（code = 'http' 时有效，否则 0） */
    httpStatus: number;
    /** 是否值得重试 */
    retryable: boolean;
    /** `.part` 断点是否保留（true 可续，false 已清） */
    partialRetained: boolean;
    /** 诊断信息（仅日志、不直接示人） */
    message: string;
}

/** onCanceled：取消完成（独立终态，非失败） */
export interface DownloadCanceledEvent {
    taskId: string;
    attemptId: number;
}

/**
 * onPaused：worker 已退出、任务静止，`.part` 保留可续（非终态）
 * 不论暂停由 JS 主动发起还是系统前台服务超时触发，都发本事件：
 * `pause()` 的 Promise 在请求暂停时就 resolve，JS 只能靠本事件得知何时能安全续传
 */
export interface DownloadPausedEvent {
    taskId: string;
    attemptId: number;
}

/** onNotificationAction：后续通知动作实现中用户点了前台通知按钮 */
export interface NotificationActionEvent {
    /** 通知动作：pauseAll / cancelAll */
    action: string;
}

/**
 * 自研原生后台下载引擎 TurboModule
 * JS 持有权威队列及并发、间隔策略；A1 原生负责已 start 任务的可靠传输和进度汇报：
 * OkHttp 流式写入 `.part` → magic-byte 容器嗅探定扩展名（回退 Content-Type / URL）→ 原子发布 → 内嵌 tag → onComplete
 * A1 的前台服务支持切后台传输：**首个任务启动时才启动服务和通知；没有活动任务时停止服务并移除通知**
 * 完成回执经 getUnackedCompletions / ackCompletion 落地；活动任务跨进程重连属于后续里程碑
 * 命令走方法；原生自主状态转移（begin / progress / finalizing / complete / error / canceled）走事件
 * 身份三分：`taskId`（队列记录）+ `attemptId`（网络执行代次，事件回带）+ `contentKey`（字节身份，绑 .part）
 * A1 支持同进程内基于 `.part` 的续传；`.part.meta`、If-Range 和活动任务跨进程重连属于后续里程碑
 * iOS 暂无实现：使用 get（而非 getEnforcing）避免 import 失败；桥层由 required() 守卫，在调用时明确报告 unsupported
 */
export interface Spec extends TurboModule {
    /** 初始化（幂等），设置进度节流间隔等选项 */
    setup(options: DownloadSetupOptions): Promise<void>;
    /**
     * 统一启动、续传和重下入口；返回包含磁盘已有字节数的受理确认
     * A1 使用 `.part` 大小发起 Range；服务端返回 206 时续传，返回 200 时截断并从头下载
     * 并发由 JS 控制，原生线程池提供安全上限；`.part.meta`、If-Range 和跨进程重连属于后续里程碑
     */
    start(request: DownloadRequest): Promise<StartAck>;
    /** 暂停网络读取并保留 `.part`，暂停任务不占传输槽；再次 start 时续传 */
    pause(taskId: string): Promise<void>;
    /** 取消：A1 删除 `.part`，不删除已发布文件，并发送 onCanceled；其余临时资源清理属于后续里程碑 */
    cancel(taskId: string): Promise<void>;
    /**
     * 查询当前活动任务，用于 App 回到前台时重连
     * A1 仅返回内存中的传输中或暂停任务，不扫描磁盘 `.part`
     */
    getActiveTasks(): Promise<ActiveDownload[]>;
    /** A4 获取尚未被 JS 入账的终态完成回执；JS 入账后调用 ackCompletion 清除 */
    getUnackedCompletions(): Promise<CompletionReceipt[]>;
    /** A4 确认终态已入账，并幂等清除对应的磁盘完成回执 */
    ackCompletion(taskId: string): void;
    /** A4 更新聚合通知上下文，包括待下载数、等待原因和本地化文案 */
    setNotificationContext(context: NotificationContext): void;
    /**
     * 清理 `downloadRoot` 下 stagingKey 不在存活集合中的残留 `.part`（孤儿文件）
     * 完成回执有独立入账生命周期（ackCompletion），不在此清理
     *
     * 回**没能清掉的候选数**（0 = 干净）：目录列不出来、删除被拒都算。调用方据此判断
     * 能不能信这个目录——换下载目录时这趟清理承担正确性（残留 `.part` 会被无条件续传接管）
     */
    cleanupOrphans(
        downloadRoot: string,
        liveStagingKeys: string[],
    ): Promise<number>;

    /** 服务端已响应、处置确定 */
    readonly onBegin: EventEmitter<DownloadBeginEvent>;
    /** 传输进度（已节流） */
    readonly onProgress: EventEmitter<DownloadProgressEvent>;
    /** A2/A3 进入定稿（嗅探、写 tag 或发布） */
    readonly onFinalizing: EventEmitter<DownloadFinalizingEvent>;
    /** 文件已发布；扩展名由 magic-byte 嗅探得出（回退 Content-Type / URL），已内嵌 tag */
    readonly onComplete: EventEmitter<DownloadCompleteEvent>;
    /** 任务失败（终态） */
    readonly onError: EventEmitter<DownloadErrorEvent>;
    /** 取消完成（终态） */
    readonly onCanceled: EventEmitter<DownloadCanceledEvent>;
    /** worker 已退出、任务静止可续（主动暂停与服务超时暂停均发） */
    readonly onPaused: EventEmitter<DownloadPausedEvent>;
    /** 用户点前台通知按钮（实现见后续里程碑） */
    readonly onNotificationAction: EventEmitter<NotificationActionEvent>;
}

export default TurboModuleRegistry.get<Spec>('NativeDownloadEngine');
