import type { IConfig } from '@/core/config';
import type { IMediaMeta } from '@/core/mediaMeta';
import type { IPluginManager } from '@/core/plugin';
import type {
    CustomNotificationButtonId,
    CustomNotificationButtons,
    PlaybackState,
    Progress,
} from '@/native/audioEngine';
import type { MediaRef, MusicItem, QualityKey } from '@/types';

/**
 * 循环模式
 * 字符串值是 App.PersistStatus `music.repeatMode` 的持久化 wire，冻结不可改（沿用 legacy）
 */
export enum RepeatMode {
    /** 列表循环：到底回到队首 */
    Queue = 'QUEUE',
    /** 单曲循环 */
    Single = 'SINGLE',
    /** 随机播放 */
    Shuffle = 'SHUFFLE',
}

/**
 * 播放失败原因码（用户可感知）
 * - `invalidItem` item 缺可播标识（platform / id）
 * - `sourceUnavailable` 重试后仍拉不到可用音源
 * - `cellularBlocked` 流量闸拦下：不是这首歌的问题，翻下一首同样过不去
 */
export type PlayerErrorCode =
    | 'invalidItem'
    | 'sourceUnavailable'
    | 'cellularBlocked';

/** 播放失败上报：命令最终无法达成播放时经 subscribeError 推给 UI 提示 */
export interface PlayerError {
    code: PlayerErrorCode;
    /** 失败的曲目 */
    item: MusicItem;
}

/** 单次播放命令选项；只影响本次 current slot，不进入 MusicItem / 队列 / 会话 */
export interface PlayOptions {
    /** 优先尝试的本地文件裸路径；不可用时照常回退持久锚点与联网解析 */
    preferredLocalPath?: string;
}

/**
 * 播放器端口：UX 命令式动作 + 反应式状态的命令式快照 + core 间事件订阅
 * React 侧读状态走 hooks（useCurrentMusic 等）；非 React 消费者读快照走 getXxx、要推送走 subscribeXxx
 * getXxx 对反应式状态完整对称；subscribeXxx 按非 React 消费者需求增补（现有 currentMusic / progress）
 */
export interface IPlayer {
    /**
     * 启动：初始化引擎 + 编织 source resolver + 订阅引擎事件 + 恢复上次会话
     * （队列 / 当前曲 / 进度 / 模式 / 音质 / 倍率）；autoPlayWhenAppStart 决定是否续播
     * 幂等：重复调用不重复注册监听、不重复恢复
     */
    setup(): Promise<void>;

    // —— 流式缓存 ——

    /** progressive 流式缓存的当前占用字节（不含下载文件 / 歌词 / 音源 URL 缓存） */
    getStreamingCacheSize(): Promise<number>;
    /** 清空 progressive 流式缓存，并返回清理后的实际剩余字节 */
    clearStreamingCache(): Promise<number>;

    // —— 播放控制 ——

    /** 播放指定曲目（不在队列则先入队），或无参恢复当前；options 仅在传 item 时生效 */
    play(item?: MusicItem, options?: PlayOptions): Promise<void>;
    pause(): Promise<void>;
    /** 播放/暂停切换：由播放器按当前是否「播放意图已发出」裁决，调用方不必自己推断 */
    togglePlayback(): Promise<void>;
    skipToNext(): Promise<void>;
    skipToPrevious(): Promise<void>;
    seekTo(seconds: number): Promise<void>;
    /** 以整张列表替换队列并播放其中 item（列表点歌主入口） */
    replaceQueueAndPlay(
        item: MusicItem,
        queue: readonly MusicItem[],
    ): Promise<void>;
    /** 播放整张列表：替换队列并从首起播；随机模式下重洗牌并从随机曲起播（集合「全部播放」入口） */
    playAll(queue: readonly MusicItem[]): Promise<void>;

    // —— 队列（都异步：可能触发 setNext / 两槽重建）——

    /** 追加到队尾（按身份去重、10000 上限） */
    enqueue(items: MusicItem | MusicItem[]): Promise<void>;
    /** 插到当前曲之后（空队列则自动播放） */
    enqueueNext(items: MusicItem | MusicItem[]): Promise<void>;
    /** 从队列移除；若为当前曲则自动前移或停止 */
    removeFromQueue(ref: MediaRef): Promise<void>;
    /** 清空队列并停止 */
    clearQueue(): Promise<void>;

    // —— 模式 / 音质 / 倍率 ——

    /** 循环模式循环切换：Queue → Shuffle → Single → Queue */
    toggleRepeatMode(): Promise<void>;
    setRepeatMode(mode: RepeatMode): Promise<void>;
    /**
     * 播完当前曲即停：置位则当前曲自然结束后暂停在下一首、不继续出声
     * 一次性——本曲结束即自动清零；优先于 RepeatMode.Single（放完这一遍就停，不再循环）
     * 主动切歌 / 换队列不清除标志，等待对象随之变为新的当前曲
     */
    setPauseAfterCurrent(enabled: boolean): Promise<void>;
    /**
     * 设置首选音质并重解析当前曲（best-effort）
     * pull 模型下无法即时确认成功，失败经 player 错误 / 状态暴露，不返回布尔
     */
    setPreferredQuality(quality: QualityKey): Promise<void>;
    /** 播放倍率，> 0（1.0 正常）；持久化 */
    setPlaybackRate(rate: number): Promise<void>;

    // —— 查询：反应式状态的命令式快照（React 侧用 hooks，非 React 消费者用这些）——

    /** ref 是否为当前曲（按 platform + id） */
    isCurrent(ref: MediaRef): boolean;
    /** 当前曲快照（供晚订阅者取初值） */
    getCurrentMusic(): MusicItem | null;
    /** 当前播放进度快照（position / duration / buffered，单位秒） */
    getProgress(): Progress;
    /** 当前播放状态快照 */
    getPlaybackState(): PlaybackState;
    /** 当前队列快照 */
    getQueue(): readonly MusicItem[];
    /** 当前曲在队列的下标；无当前曲或不在队列时为 -1（UI 打开时定位当前曲） */
    getCurrentIndex(): number;
    /** 当前循环模式 */
    getRepeatMode(): RepeatMode;
    /** 当前首选音质 */
    getPreferredQuality(): QualityKey;
    /** 当前播放倍率 */
    getPlaybackRate(): number;

    // —— 通知栏自定义按钮：状态与文案由 app 层组装（文案要 i18n），图标与落位在原生 ——
    // 播放三连不在此列，它由原生按 player 声明的可用命令自动生成

    /** 全量替换通知栏自定义按钮 */
    setCustomNotificationButtons(buttons: CustomNotificationButtons): void;
    /** 通知栏自定义按钮被点击；由 app 层按当前状态决策，返回退订 */
    subscribeCustomNotificationButton(
        cb: (button: CustomNotificationButtonId) => void,
    ): () => void;

    // —— 事件：供 core/history·lyric 等非 React 消费者组装（禁直订 player 的 jotai atom）——

    /** 当前曲身份变化（含 null=停止 / 清空）；订阅即回放当前值，返回退订 */
    subscribeCurrentMusic(cb: (item: MusicItem | null) => void): () => void;
    /** 一首歌真正开始播放（history 记这个；选中 ≠ 开播，解析失败的不触发），返回退订 */
    subscribePlaybackStarted(cb: (item: MusicItem) => void): () => void;
    /** 播放态变化（悬浮歌词的播放键靠它切图标）；订阅即回放当前值，返回退订 */
    subscribePlaybackState(cb: (state: PlaybackState) => void): () => void;
    /**
     * 「播完当前曲即停」标志变化：置位、撤销，以及**被曲终消费**都会发
     * 定时关闭靠它知道「等待当前曲结束」何时收口——该事实取决于原生有没有晋升、
     * 走了哪条分支，只有 player 算得出，消费者无法从曲终反推
     * 订阅即回放当前值，返回退订
     */
    subscribePauseAfterCurrent(cb: (enabled: boolean) => void): () => void;
    /** 播放进度推进（lyric 行同步 / 悬浮歌词；命令式，避免 lyric 绕过 player 直连引擎），返回退订 */
    subscribeProgress(cb: (progress: Progress) => void): () => void;
    /** 播放失败（用户可感知）；命令式端口供 UI 弹提示，返回退订 */
    subscribeError(cb: (error: PlayerError) => void): () => void;
}

/** 构造注入依赖（全接口，app/container 按拓扑序装配） */
export interface PlayerDeps {
    /** 音源解析 / 相似歌搜索 / 替代源 */
    pluginManager: IPluginManager;
    config: IConfig;
    /** 读本地 / 已下载路径（无本地文件时为空） */
    mediaMeta: IMediaMeta;
}
