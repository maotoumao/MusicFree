import { TurboModuleRegistry, type TurboModule } from 'react-native';

import type { EventEmitter } from 'react-native/Libraries/Types/CodegenTypes';

/* 跨桥字段用 string（codegen 对字符串字面量 union 支持受限）；这些 union 仅供 JS 侧类型提示。 */

/** 播放状态：全局唯一权威状态，只描述当前曲目。 */
export type PlaybackState =
    /** 未加载任何音源（初始 / reset 后） */
    | 'idle'
    /** 正在准备即将出声的音源 */
    | 'loading'
    /** 出声中数据不足、卡住等数据 */
    | 'buffering'
    | 'playing'
    /** 有源就绪但未出声，可原位恢复 */
    | 'paused'
    /** 停止：队列到底 或 stop()，position 归零、无恢复意图 */
    | 'stopped'
    | 'error';

/** 音源流类型，决定原生用哪条 MediaSource。 */
export type StreamType = 'progressive' | 'hls' | 'dash';

/** 远程控制命令（通知/锁屏/蓝牙/车机）。play/pause/seek 由引擎直接处理不外发；此处仅列 JS 需响应的。 */
export type RemoteCommand = 'next' | 'prev' | 'stop' | 'duck';

/** 槽的瘦身份 + 展示信息；完整 musicItem 留在 JS，不跨桥。 */
export interface AudioItem {
    /** 插件来源标识，与 id 合成唯一身份 */
    platform: string;
    /** 曲目在该插件内的唯一 id */
    id: string;
    /** 本次 load 的 occurrence 号，JS 单调分配、每次 setAudio/setNext 换新号（同一首重发也换号）；原生不透明、只存并在事件里原样回带，供 JS 精确定位「哪一次 load」而不受 cacheKey 复用/并发换曲影响 */
    slotId?: number;
    /** 两槽匹配/解析键；缺省 platform+id（原生拼接，原生无 quality 概念）。多音质传 platform+id+quality 分桶避免共桶（仅 progressive 落盘）；hls/dash 不落盘 */
    cacheKey?: string;
    /** StreamType，缺省 progressive；决定原生选哪条 MediaSource */
    streamType?: string;
    /** 通知/锁屏标题 */
    title?: string;
    /** 通知/锁屏歌手 */
    artist?: string;
    /** 通知/锁屏专辑 */
    album?: string;
    /**
     * 是否要从码流元数据里提取内嵌封面并经 onEmbeddedArtwork 回传；缺省 true
     * 本地歌传 false：它们的内嵌封面由本地插件经 TagLib 提取、另有缓存，原生不必再解一份
     */
    extractEmbeddedArtwork?: boolean;
    /** 封面：远程 URL 或本地路径 */
    artwork?: string;
    /** 时长（秒），已知则通知显示 */
    duration?: number;
}

/** resolveSource 返回的可播音源（贵、联网、插件相关）。 */
export interface AudioSource {
    /** progressive=媒体URL；hls/dash=清单URL */
    url: string;
    /** 请求头，如鉴权/防盗链 */
    headers?: { [key: string]: string };
}

/** 播放进度（秒）。 */
export interface Progress {
    /** 当前位置 */
    position: number;
    /** 总时长 */
    duration: number;
    /** 已缓冲位置 */
    buffered: number;
}

/** onProgress payload：进度值及采样自 currentMediaItem 的 slotId。JS 按 slotId 丢弃切歌时迟到的旧 tick；slotId 不外泄给 UX，adapter 拆包后仅供 SlotController 使用 */
export interface ProgressEvent {
    /** 本次跨桥投递 id；JS 完成消费后须 ack，原生据此放行最新待发样本 */
    deliveryId: number;
    /** 当前位置 */
    position: number;
    /** 总时长 */
    duration: number;
    /** 已缓冲位置 */
    buffered: number;
    /** 这些进度值对应的 currentMediaItem 的 slotId；暂停、缓冲、seek 时也可能发送；无有效 currentMediaItem 时不发送 */
    slotId: number;
}

/** 均衡器单个频段。 */
export interface EqBand {
    /** 频段序号 */
    index: number;
    /** 中心频率（Hz） */
    centerFreq: number;
    /** 当前增益（millibel） */
    gain: number;
    /** 增益下限 */
    minGain: number;
    /** 增益上限 */
    maxGain: number;
}

/** 前台通知外观选项。 */
export interface NotificationOptions {
    /** 是否显示进度条 */
    showSeek?: boolean;
    /** 是否显示停止按钮 */
    showStop?: boolean;
}

/**
 * 通知栏自定义按钮。
 * 位置与图标由原生定死（图标只能是编译进 APK 的 drawable），JS 只下发状态与文案
 */
export interface CustomNotificationButton {
    /** 按钮状态，原生据此选图标 */
    state: string;
    /** 按钮标题，用于无障碍与长按提示 */
    title: string;
}

/**
 * 通知栏自定义按钮全集；字段缺省=该按钮不显示。
 * 不含播放三连——那是 Media3 按 player 声明的可用命令自动生成的，app 不经手
 */
export interface CustomNotificationButtons {
    /** 收藏，排在上一首左侧；state: 'on' | 'off' */
    favorite?: CustomNotificationButton;
    /** 桌面歌词，排在下一首右侧；state: 'off' | 'on' | 'locked' */
    lyric?: CustomNotificationButton;
}

/** onCustomNotificationButton payload：某个自定义按钮被点击。 */
export interface CustomNotificationButtonEvent {
    /** 被点击的按钮：'favorite' | 'lyric'。原生不解释其含义，由 JS 按当前状态决策 */
    button: string;
}

/** 引擎初始化选项。 */
export interface SetupOptions {
    /** = 边下边播开关 */
    cacheEnabled: boolean;
    /** SimpleCache 上限 */
    maxCacheBytes: number;
    /** onProgress 间隔 */
    progressIntervalMs: number;
    mixWithOthers: boolean;
    notification?: NotificationOptions;
}

/** onStateChange payload。 */
export interface StateChangeEvent {
    /** PlaybackState */
    state: string;
}

/** onAudioEnd payload：一首歌自然播完（仅 AUTO 过渡发）。JS 照 promoted 对账、无需回查队列。 */
export interface AudioEndEvent {
    /** 刚自然播完的那首（含其 slotId） */
    ended: AudioItem;
    /** 引擎已无缝晋升为新当前曲的那首（含其 slotId）；队列到底、无 next 可晋升则缺省 */
    promoted?: AudioItem;
}

/** onStarted payload：某媒体项首次真正出声。无缝续播（AUTO 晋升后立即出声）也发；resume、加载/缓冲中、出声前就失败的都不发。按 slotId occurrence 去重（一次 load 只发一次）。 */
export interface StartedEvent {
    /** 刚开始真正出声的那首（含其 slotId） */
    item: AudioItem;
}

/** onError payload：某槽解析/播放失败。 */
export interface ErrorEvent {
    /** 出错的那次 load 的曲目（含其 slotId，供 JS 按 slotId 归属、丢弃已被替换的旧 load 的迟到错误）；引擎无当前曲(slots 空)时可能缺省 */
    item?: AudioItem;
    /** 出错的槽：'current'=当前播放中断需恢复；'next'=预取失败当前不受影响，重备 next */
    slot: string;
    /** 错误码：'E_UNSUPPORTED' | 'E_RESOLVE' | 'E_SOURCE' | 'E_DECODE' | 'E_UNKNOWN'（细节见 message） */
    code: string;
    /** 错误信息 */
    message: string;
}

/** onRemote 的命令参数（当前仅 duck 会携带；原生暂不发 duck，预留给未来音频焦点打断策略）。 */
export interface RemotePayload {
    /** duck：是否应暂停 */
    paused?: boolean;
    /** duck：音频焦点是否永久丢失（true=停/不自动恢复；false=瞬时可恢复） */
    permanent?: boolean;
}

/** onRemote payload：统一远程控制。 */
export interface RemoteEvent {
    /** RemoteCommand */
    command: string;
    payload?: RemotePayload;
}

/** onResolveSource payload：请 JS 解析某槽音源。 */
export interface ResolveSourceEvent {
    /** 与 provideSource 配对 */
    requestId: number;
    /** 待解析的曲目 */
    item: AudioItem;
}

/**
 * onEmbeddedArtwork payload：原生从码流元数据（ID3 APIC / FLAC PICTURE 等）里解出了封面，已落成缓存文件
 * 只在该次 load 的 AudioItem 没带 artwork 时发、每次 load 最多一次；通知栏本就能显示这份封面，此事件是让 App 内也能用上
 * iOS 暂不发（AVAsset 元数据取封面留待后续）
 */
export interface EmbeddedArtworkEvent {
    /** 解出封面的那次 load 的曲目（含其 slotId，供 JS 按 slotId 归属） */
    item: AudioItem;
    /** 缓存文件的 file:// 地址 */
    uri: string;
}

/** 原生引擎 TurboModule 接口。 */
export interface Spec extends TurboModule {
    getEngineVersion(): string;

    setup(options: SetupOptions): Promise<void>;

    /** 确认一条 onProgress 已在 JS 端消费完成；重复或迟到的 id 由原生忽略 */
    ackProgress(deliveryId: number): void;

    /** resolver 回填：JS 解析完把结果按 requestId 交回；source=null 视为失败。 */
    provideSource(requestId: number, source: AudioSource | null): void;

    /** 原子设两槽（current + next）；next 必填、可为 null=清空。 */
    setAudio(
        item: AudioItem,
        autoPlay: boolean,
        next: AudioItem | null,
    ): Promise<void>;
    setNext(next: AudioItem | null): Promise<void>;

    play(): Promise<void>;
    /** 暂停：保留 position 与已就绪 source，play() 原位恢复 */
    pause(): Promise<void>;
    /** 停止：position 归零、释放当前解码缓冲；内核不销毁，可重新 setAudio/play（非 destroy） */
    stop(): Promise<void>;
    seekTo(seconds: number): Promise<void>;

    /** 播放倍率，> 0（1.0 正常、1.5 加速） */
    setRate(rate: number): Promise<void>;
    getRate(): Promise<number>;
    /** 线性音量 0..1 */
    setVolume(volume: number): Promise<void>;
    setMixWithOthers(enabled: boolean): void;

    getProgress(): Promise<Progress>;
    /** 返回 PlaybackState */
    getState(): Promise<string>;

    updateMeta(item: AudioItem): Promise<void>;
    /** 清空两槽并停止，回到未加载状态 */
    reset(): Promise<void>;

    /** 全量替换通知栏自定义按钮 */
    setCustomNotificationButtons(buttons: CustomNotificationButtons): void;

    getCacheSize(): Promise<number>;
    clearCache(): Promise<void>;
    removeCache(item: AudioItem): Promise<void>;

    eqGetBands(): Promise<EqBand[]>;
    eqSetBandGain(index: number, millibel: number): Promise<void>;
    eqSetEnabled(enabled: boolean): Promise<void>;
    eqGetPresets(): Promise<string[]>;
    eqUsePreset(name: string): Promise<void>;

    readonly onStateChange: EventEmitter<StateChangeEvent>;
    readonly onProgress: EventEmitter<ProgressEvent>;
    readonly onAudioEnd: EventEmitter<AudioEndEvent>;
    readonly onStarted: EventEmitter<StartedEvent>;
    readonly onError: EventEmitter<ErrorEvent>;
    readonly onRemote: EventEmitter<RemoteEvent>;
    readonly onResolveSource: EventEmitter<ResolveSourceEvent>;
    readonly onCustomNotificationButton: EventEmitter<CustomNotificationButtonEvent>;
    readonly onEmbeddedArtwork: EventEmitter<EmbeddedArtworkEvent>;
}

export default TurboModuleRegistry.getEnforcing<Spec>('NativeAudioEngine');
