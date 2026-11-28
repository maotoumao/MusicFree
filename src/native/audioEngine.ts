/**
 * Audio 原生桥适配层：包裹裸 codegen spec（`./specs/NativeAudioEngine`）。
 * 纯桥、React-free——只做「枚举回填 / 事件解包 / Promise 收口 / setSourceResolver 编织 / setup 默认」。
 * 正式代码一律从 `@/native/audioEngine` 用引擎，禁直接 import `./specs`。业务（音质排序 / 相似歌 / mediaCache / toast）留 core
 */
import Native from './specs/NativeAudioEngine';

import type {
    AudioItem,
    AudioSource,
    Progress,
    EqBand,
    SetupOptions,
    RemotePayload,
} from './specs/NativeAudioEngine';

// DTO 直接 re-export（不重定义，避免第二真相源）
export type {
    AudioItem,
    AudioSource,
    Progress,
    EqBand,
    SetupOptions,
    NotificationOptions,
    RemotePayload,
} from './specs/NativeAudioEngine';

/** 播放状态（spec 里是裸 string，这里回填语义 enum） */
export enum PlaybackState {
    /** 空闲：未加载任何音源 */
    Idle = 'idle',
    /** 加载中：正在解析音源 / 准备解码器 */
    Loading = 'loading',
    /** 缓冲中：已开始但数据不足，等待更多数据 */
    Buffering = 'buffering',
    /** 播放中 */
    Playing = 'playing',
    /** 已暂停 */
    Paused = 'paused',
    /** 已停止：队列播完或显式 stop */
    Stopped = 'stopped',
    /** 出错：详见 onError */
    Error = 'error',
}

/**
 * 是否处于「播放意图已发出」的状态：播放中，或正在加载 / 缓冲
 * 加载与缓冲不携带 playWhenReady，但用户视角就是「在播」，故播放键此时应显示暂停、点击即暂停
 */
export function isPlaybackActive(state: PlaybackState): boolean {
    return (
        state === PlaybackState.Playing ||
        state === PlaybackState.Loading ||
        state === PlaybackState.Buffering
    );
}

/** 音源流类型（决定原生选哪条 MediaSource） */
export enum StreamType {
    /** 渐进式单文件（http mp3/flac 等） */
    Progressive = 'progressive',
    /** HLS（m3u8 切片流） */
    Hls = 'hls',
    /** DASH（mpd 切片流） */
    Dash = 'dash',
}

/** 错误码（细节见 message） */
export enum AudioErrorCode {
    /** 格式 / 协议不支持 */
    Unsupported = 'E_UNSUPPORTED',
    /** 音源解析失败：resolver 抛错 / 返回 null / 超时 */
    Resolve = 'E_RESOLVE',
    /** 音源不可达：网络 / 404 / 鉴权失败 */
    Source = 'E_SOURCE',
    /** 解码失败 */
    Decode = 'E_DECODE',
    /** 未归类错误 */
    Unknown = 'E_UNKNOWN',
}

/** 出错的槽：current=当前播放中断需恢复；next=预取失败当前不受影响 */
export enum ErrorSlot {
    /** 当前播放槽：播放中断，需恢复 */
    Current = 'current',
    /** 预取槽：下一首预取失败，当前播放不受影响 */
    Next = 'next',
}

/** 远程控制命令（通知/锁屏/蓝牙） */
export enum RemoteCommand {
    /** 下一首 */
    Next = 'next',
    /** 上一首 */
    Prev = 'prev',
    /** 停止（通知划走 / 停止键） */
    Stop = 'stop',
    /** 短暂避让：其他 app 抢占焦点时降低音量 */
    Duck = 'duck',
}

/** 通知栏自定义按钮标识（spec 里是裸 string） */
export enum CustomNotificationButtonId {
    /** 收藏，排在上一首左侧 */
    Favorite = 'favorite',
    /** 桌面歌词，排在下一首右侧 */
    Lyric = 'lyric',
}

/**
 * 通知栏自定义按钮全集；字段缺省=该按钮不显示。
 * 不含播放三连——那是 Media3 按 player 声明的可用命令自动生成的
 */
export interface CustomNotificationButtons {
    favorite?: { state: 'on' | 'off'; title: string };
    lyric?: { state: 'off' | 'on' | 'locked'; title: string };
}

/** onError 解包后 payload */
export interface AudioError {
    item?: AudioItem;
    slot: ErrorSlot;
    code: AudioErrorCode;
    message: string;
}

/** onRemote 解包后 payload */
export interface RemoteAction {
    command: RemoteCommand;
    payload?: RemotePayload;
}

/** 事件退订 */
export type Unsubscribe = () => void;

/** setup 默认值：默认不开缓存；调用方只传想改的字段 */
const DEFAULT_SETUP: SetupOptions = {
    cacheEnabled: false,
    maxCacheBytes: 512 * 1024 * 1024,
    progressIntervalMs: 500,
    mixWithOthers: false,
};

type ProgressConsumer = (
    progress: Progress,
    slotId: number,
) => void | Promise<void>;

interface ProgressDispatcher {
    readonly consumers: Map<object, ProgressConsumer>;
}

const runtime = globalThis as typeof globalThis & {
    __musicFreeAudioProgressDispatcher?: ProgressDispatcher;
};

// 原生只建一条进度订阅：JS 内扇出，并等本次全部消费者 settle 后统一 ack 一次
const progressDispatcher =
    runtime.__musicFreeAudioProgressDispatcher ??
    (() => {
        const dispatcher: ProgressDispatcher = { consumers: new Map() };
        Native.onProgress(e => {
            const progress = {
                position: e.position,
                duration: e.duration,
                buffered: e.buffered,
            };
            const pending: Promise<void>[] = [];
            for (const consume of [...dispatcher.consumers.values()]) {
                try {
                    const result = consume(progress, e.slotId);
                    if (result) {
                        pending.push(result.catch(() => undefined));
                    }
                } catch {
                    // 单个消费者失败不阻断其它消费者，也不永久占住原生发送窗口
                }
            }
            const acknowledge = () => Native.ackProgress(e.deliveryId);
            if (pending.length === 0) {
                acknowledge();
            } else {
                Promise.all(pending).then(acknowledge);
            }
        });
        runtime.__musicFreeAudioProgressDispatcher = dispatcher;
        return dispatcher;
    })();

/** 引擎把手：命令透传（输出回填枚举）+ typed 事件 + setSourceResolver。usage：`audioEngine.play()` */
export const audioEngine = {
    getVersion: (): string => Native.getEngineVersion(),
    setup: (options?: Partial<SetupOptions>): Promise<void> =>
        Native.setup({ ...DEFAULT_SETUP, ...options }),

    setAudio: (
        item: AudioItem,
        autoPlay: boolean,
        next: AudioItem | null,
    ): Promise<void> => Native.setAudio(item, autoPlay, next),
    setNext: (next: AudioItem | null): Promise<void> => Native.setNext(next),

    play: (): Promise<void> => Native.play(),
    pause: (): Promise<void> => Native.pause(),
    stop: (): Promise<void> => Native.stop(),
    seekTo: (seconds: number): Promise<void> => Native.seekTo(seconds),
    setRate: (rate: number): Promise<void> => Native.setRate(rate),
    getRate: (): Promise<number> => Native.getRate(),
    setVolume: (volume: number): Promise<void> => Native.setVolume(volume),
    setMixWithOthers: (enabled: boolean): void =>
        Native.setMixWithOthers(enabled),
    getProgress: (): Promise<Progress> => Native.getProgress(),
    getState: async (): Promise<PlaybackState> =>
        (await Native.getState()) as PlaybackState,
    updateMeta: (item: AudioItem): Promise<void> => Native.updateMeta(item),
    reset: (): Promise<void> => Native.reset(),

    setCustomNotificationButtons: (buttons: CustomNotificationButtons): void =>
        Native.setCustomNotificationButtons(buttons),

    getCacheSize: (): Promise<number> => Native.getCacheSize(),
    clearCache: (): Promise<void> => Native.clearCache(),
    removeCache: (item: AudioItem): Promise<void> => Native.removeCache(item),

    eqGetBands: (): Promise<EqBand[]> => Native.eqGetBands(),
    eqSetBandGain: (index: number, millibel: number): Promise<void> =>
        Native.eqSetBandGain(index, millibel),
    eqSetEnabled: (enabled: boolean): Promise<void> =>
        Native.eqSetEnabled(enabled),
    eqGetPresets: (): Promise<string[]> => Native.eqGetPresets(),
    eqUsePreset: (name: string): Promise<void> => Native.eqUsePreset(name),

    // —— 事件：解包 payload、返回退订 ——
    onStateChange: (cb: (state: PlaybackState) => void): Unsubscribe => {
        const sub = Native.onStateChange(e => cb(e.state as PlaybackState));
        return () => sub.remove();
    },
    onProgress: (cb: ProgressConsumer): Unsubscribe => {
        const token = {};
        progressDispatcher.consumers.set(token, cb);
        return () => progressDispatcher.consumers.delete(token);
    },
    onAudioEnd: (
        cb: (ended: AudioItem, promoted: AudioItem | null) => void,
    ): Unsubscribe => {
        const sub = Native.onAudioEnd(e => cb(e.ended, e.promoted ?? null));
        return () => sub.remove();
    },
    onStarted: (cb: (item: AudioItem) => void): Unsubscribe => {
        const sub = Native.onStarted(e => cb(e.item));
        return () => sub.remove();
    },
    onEmbeddedArtwork: (
        cb: (item: AudioItem, uri: string) => void,
    ): Unsubscribe => {
        const sub = Native.onEmbeddedArtwork(e => cb(e.item, e.uri));
        return () => sub.remove();
    },
    onError: (cb: (error: AudioError) => void): Unsubscribe => {
        const sub = Native.onError(e =>
            cb({
                item: e.item ?? undefined,
                slot: e.slot as ErrorSlot,
                code: e.code as AudioErrorCode,
                message: e.message,
            }),
        );
        return () => sub.remove();
    },
    onRemote: (cb: (action: RemoteAction) => void): Unsubscribe => {
        const sub = Native.onRemote(e =>
            cb({
                command: e.command as RemoteCommand,
                payload: e.payload ?? undefined,
            }),
        );
        return () => sub.remove();
    },
    onCustomNotificationButton: (
        cb: (button: CustomNotificationButtonId) => void,
    ): Unsubscribe => {
        const sub = Native.onCustomNotificationButton(e =>
            cb(e.button as CustomNotificationButtonId),
        );
        return () => sub.remove();
    },

    /**
     * pull 模型关键助手：把 core 注入的「item → source」异步 resolver 编织进
     * onResolveSource ↔ provideSource（封装掉 requestId，core 不碰裸 id）。
     * resolver 抛错或返回 null 一律回填 null（原生归 E_RESOLVE）；原生侧有 25s 超时兜底，迟到的回填命中已移除的 pending 即 no-op
     */
    setSourceResolver: (
        resolve: (item: AudioItem) => Promise<AudioSource | null>,
    ): Unsubscribe => {
        const sub = Native.onResolveSource(async ({ requestId, item }) => {
            let source: AudioSource | null = null;
            try {
                source = await resolve(item);
            } catch {
                source = null;
            }
            Native.provideSource(requestId, source);
        });
        return () => sub.remove();
    },
};
