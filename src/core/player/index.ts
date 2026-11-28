/**
 * 播放器编排层：实现 IPlayer，将命令转换为队列变更并下发到 SlotController 的两槽
 * 权威状态在此维护：#queue（PlayQueue）、#currentMusic、模式、音质和倍率；store atom 仅为推送给 UI 的镜像
 * 会话持久化经 PlayerSession：队列变更即时推 atom，前台去抖落盘 / 后台直落（切后台也立即 flush），进度在 checkpoint 时保存（暂停 / seek / 切歌 / 切后台）
 * 事件订阅（history / lyric 等非 React 消费者）通过 subscribeXxx 命令式端口提供，不直接订阅 atom
 */
import { AppState, type AppStateStatus } from 'react-native';

import { delay } from '@/infra/timer';
import {
    audioEngine,
    isPlaybackActive,
    PlaybackState,
} from '@/native/audioEngine';
import { isLocalPlatform, isSameMediaRef, mediaKey } from '@/utils/media';

import { PlayQueue } from './queue';
import { PlayerSession } from './session';
import { SlotController } from './slots';
import { SourceCache } from './sourceCache';
import { SourceResolver } from './sourceResolver';
import {
    getPlaybackState as readPlaybackState,
    getProgress as readProgress,
    setCurrentMusic as publishCurrentMusic,
    setPlaybackRate as publishPlaybackRate,
    setPlaybackState as publishPlaybackState,
    setPreferredQuality as publishPreferredQuality,
    setProgress as publishProgress,
    setQueue as publishQueue,
    setRepeatMode as publishRepeatMode,
} from './store';
import { RepeatMode } from './types';

import type { IPlayer, PlayerDeps, PlayerError, PlayOptions } from './types';
import type { IConfig } from '@/core/config';
import type { IPluginManager } from '@/core/plugin';
import type {
    CustomNotificationButtonId,
    CustomNotificationButtons,
    Progress,
} from '@/native/audioEngine';
import type { MediaRef, MusicItem, QualityKey } from '@/types';

/** 首选音质默认值（config 未配置时使用） */
const FALLBACK_QUALITY: QualityKey = 'standard';

/** toggleRepeatMode 的循环顺序：Queue → Shuffle → Single → Queue */
const REPEAT_CYCLE: readonly RepeatMode[] = [
    RepeatMode.Queue,
    RepeatMode.Shuffle,
    RepeatMode.Single,
];

/** 播放位置节流保存阈值（秒）：连续播放每前进约此值落盘一次 checkpoint */
const POSITION_SAVE_INTERVAL_SEC = 3;

/** getMusicInfo 补充信息缓存上限（会话级 FIFO）：约覆盖最近这么多首、超出淘汰最早写入项，防长会话无限膨胀 */
const MUSIC_INFO_CACHE_LIMIT = 500;

/**
 * 队列落盘去抖窗口（毫秒）：队列整份序列化，大队列下每次变更都同步写会卡住交互
 * 仅前台去抖，连续变更（逐行删歌）合并为一次；后台变更直接落盘，不押注定时器能熬过系统休眠
 */
const QUEUE_SAVE_DEBOUNCE_MS = 300;

export class Player implements IPlayer {
    readonly #config: IConfig;
    readonly #pluginManager: IPluginManager;
    readonly #session = new PlayerSession();
    readonly #cache = new SourceCache();
    readonly #resolver: SourceResolver;
    readonly #queue = new PlayQueue();
    readonly #slots: SlotController;
    /** getMusicInfo 补充过的显示信息缓存（by mediaKey，会话级 FIFO 有界）：同曲重播直接复用、不重复拉取 */
    readonly #musicInfoCache = new Map<string, Partial<MusicItem>>();
    /** 当前曲由原生内嵌封面补上的地址；只用于下发原生元数据时把它剥掉，不代表任何持久状态 */
    #embeddedArtworkUri: string | null = null;

    #repeatMode = RepeatMode.Queue;
    #preferredQuality: QualityKey = FALLBACK_QUALITY;
    #playbackRate = 1;
    #currentMusic: MusicItem | null = null;
    /** 最近一次进度位置（秒），用于保存 checkpoint */
    #lastPosition = 0;
    /** 上次实际落盘的位置（秒），作节流基准；区别于 #lastPosition（最近一次 tick 的位置） */
    #lastSavedPosition = 0;
    /** 上次落盘的曲目时长（秒），避免每 tick 重复写同一值；切歌时重置为新曲 hint 或 0 */
    #lastSavedDuration = 0;
    /** 待落盘的队列快照（null 表示无挂起）：去抖窗口内只留最后一份 */
    #pendingQueue: MusicItem[] | null = null;
    /** 去抖等待的取消句柄：新变更到来或立即 flush 时中止上一轮 */
    #queueSaveAbort: AbortController | null = null;
    /** setup 单次 promise：并发 / 重复调用共享同一次初始化（幂等，不重复注册监听 / 不重复恢复） */
    #setupPromise: Promise<void> | null = null;
    #appStateSub: ReturnType<typeof AppState.addEventListener> | null = null;

    readonly #currentListeners = new Set<(item: MusicItem | null) => void>();
    readonly #startedListeners = new Set<(item: MusicItem) => void>();
    readonly #stateListeners = new Set<(state: PlaybackState) => void>();
    readonly #progressListeners = new Set<(progress: Progress) => void>();
    readonly #errorListeners = new Set<(error: PlayerError) => void>();
    readonly #pauseAfterCurrentListeners = new Set<
        (enabled: boolean) => void
    >();
    /** 「播完当前曲即停」当前值：供晚订阅者取初值（真相源在 SlotController） */
    #pauseAfterCurrent = false;

    constructor(deps: PlayerDeps) {
        this.#config = deps.config;
        this.#pluginManager = deps.pluginManager;
        this.#resolver = new SourceResolver({
            pluginManager: deps.pluginManager,
            mediaMeta: deps.mediaMeta,
            config: deps.config,
            cache: this.#cache,
        });
        this.#slots = new SlotController({
            resolver: this.#resolver,
            cache: this.#cache,
            queue: this.#queue,
            hooks: {
                getRepeatMode: () => this.#repeatMode,
                getPreferredQuality: () => this.#preferredQuality,
                stopOnError: () =>
                    this.#config.get('basic.autoStopWhenError') ?? false,
                onCurrentChange: this.#handleCurrentChange,
                onPlaybackStarted: this.#handlePlaybackStarted,
                onEmbeddedArtwork: this.#handleEmbeddedArtwork,
                onStateChange: this.#handleStateChange,
                onProgress: this.#handleProgress,
                onPauseAfterCurrentChange: this.#handlePauseAfterCurrentChange,
                onError: this.#handleError,
            },
        });
    }

    setup(): Promise<void> {
        this.#setupPromise ??= this.#runSetup();
        return this.#setupPromise;
    }

    async #runSetup(): Promise<void> {
        const maxCacheBytes = this.#config.get('basic.maxCacheSize');
        this.#config.subscribe(['basic.notInterrupt'], () => {
            audioEngine.setMixWithOthers(
                this.#config.get('basic.notInterrupt') ?? false,
            );
        });
        await this.#slots.setup({
            cacheEnabled: true,
            mixWithOthers: this.#config.get('basic.notInterrupt') ?? false,
            ...(this.#config.isValid('basic.maxCacheSize', maxCacheBytes)
                ? { maxCacheBytes }
                : {}),
        });
        // 订阅先于 hydrate：反过来的话，「读完到装上」之间被别处（设置页 / 备份恢复）改掉就收不到，
        // 会一直用旧音质直到下次再改或重启。两步都排在会话恢复之前，恢复抛错也不影响音质就位
        this.#config.subscribe(['basic.defaultPlayQuality'], () => {
            this.#syncPreferredQualityFromConfig();
        });
        this.#preferredQuality =
            this.#config.get('basic.defaultPlayQuality') ?? FALLBACK_QUALITY;
        publishPreferredQuality(this.#preferredQuality);
        try {
            await this.#restoreSession();
        } catch {
            // 会话恢复失败时按空会话处理，播放器仍可正常使用
        }
        this.#appStateSub = AppState.addEventListener(
            'change',
            this.#handleAppStateChange,
        );
    }

    async getStreamingCacheSize(): Promise<number> {
        await this.setup();
        return audioEngine.getCacheSize();
    }

    async clearStreamingCache(): Promise<number> {
        await this.setup();
        await audioEngine.clearCache();
        return audioEngine.getCacheSize();
    }

    // —— 播放控制 ——

    async play(item?: MusicItem, options?: PlayOptions): Promise<void> {
        // 所有命令先执行幂等的 setup，确保引擎就绪且会话恢复完成，避免用户命令与恢复过程竞态
        await this.setup();
        if (item) {
            if (!this.#queue.has(item)) {
                this.#queue.append([item]);
                this.#commitQueue();
            }
            await this.#slots.play(item, options);
            return;
        }
        if (this.#currentMusic) {
            await this.#slots.resume();
            return;
        }
        const first = this.#queue.at(0);
        if (first) {
            await this.#slots.play(first);
        }
    }

    async pause(): Promise<void> {
        await this.setup();
        return this.#slots.pause();
    }

    async togglePlayback(): Promise<void> {
        // 加载 / 缓冲中也算播放意图，否则这两个状态下按不动
        return isPlaybackActive(readPlaybackState())
            ? this.pause()
            : this.play();
    }

    async skipToNext(): Promise<void> {
        await this.setup();
        return this.#slots.skipToNext();
    }

    async skipToPrevious(): Promise<void> {
        await this.setup();
        return this.#slots.skipToPrevious();
    }

    async seekTo(seconds: number): Promise<void> {
        await this.setup();
        await this.#seekTo(seconds);
    }

    /** 内部 seek（setup 已完成）：下发 seek、同步 #lastPosition 并保存 checkpoint；不再 await setup，避免嵌套门控打乱命令顺序 */
    async #seekTo(seconds: number): Promise<void> {
        await this.#slots.seekTo(seconds);
        this.#lastPosition = seconds;
        this.#persistPosition(seconds);
    }

    async replaceQueueAndPlay(
        item: MusicItem,
        queue: readonly MusicItem[],
    ): Promise<void> {
        await this.setup();
        this.#queue.replace(queue, item);
        // item 不在列表内也保证可播且 current ∈ queue（否则 session 恢复会丢弃、next 也算不出）
        if (!this.#queue.has(item)) {
            this.#queue.append([item]);
        }
        // 随机模式下重洗牌（须在 replace 收缩之后）；点中的曲目按 identity 起播，不受下标变化影响
        if (this.#repeatMode === RepeatMode.Shuffle) {
            this.#queue.shuffle();
        }
        this.#commitQueue();
        const canonical = this.#queue.at(this.#queue.indexOf(item)) ?? item;
        await this.#slots.play(canonical);
    }

    async playAll(queue: readonly MusicItem[]): Promise<void> {
        // 空列表不动播放器：避免清了队列却留下旧 current 的脏状态（正常 UI 也会禁用空歌单的全部播放）
        if (queue.length === 0) {
            return;
        }
        await this.setup();
        this.#queue.replace(queue);
        // 随机模式下重洗牌、从随机曲起播；否则从首曲。随机语义在此收口，调用方不感知模式
        if (this.#repeatMode === RepeatMode.Shuffle) {
            this.#queue.shuffle();
        }
        this.#commitQueue();
        const first = this.#queue.at(0);
        if (first) {
            await this.#slots.play(first);
        }
    }

    // —— 队列 ——

    async enqueue(items: MusicItem | MusicItem[]): Promise<void> {
        await this.setup();
        this.#queue.append(toArray(items));
        this.#commitQueue();
        await this.#slots.refreshNext();
    }

    async enqueueNext(items: MusicItem | MusicItem[]): Promise<void> {
        await this.setup();
        const batch = toArray(items);
        if (this.#currentMusic) {
            this.#queue.insertAfter(this.#currentMusic, batch);
            this.#commitQueue();
            await this.#slots.refreshNext();
            return;
        }
        // 队列为空或没有当前曲：追加后从队首开始播放
        this.#queue.append(batch);
        this.#commitQueue();
        const first = this.#queue.at(0);
        if (first) {
            await this.#slots.play(first);
        }
    }

    async removeFromQueue(ref: MediaRef): Promise<void> {
        await this.setup();
        const wasCurrent = this.isCurrent(ref);
        const removedAt = this.#queue.remove(ref);
        if (removedAt < 0) {
            return;
        }
        this.#commitQueue();
        if (!wasCurrent) {
            await this.#slots.refreshNext();
            return;
        }
        // 删除当前曲：继续播放其原位置的下一首，队列为空则停止
        if (this.#queue.isEmpty()) {
            await this.#slots.reset();
            return;
        }
        const nextIndex = removedAt < this.#queue.size ? removedAt : 0;
        const next = this.#queue.at(nextIndex);
        await (next ? this.#slots.play(next) : this.#slots.reset());
    }

    async clearQueue(): Promise<void> {
        await this.setup();
        this.#queue.clear();
        this.#commitQueue();
        await this.#slots.reset();
    }

    // —— 模式 / 音质 / 倍率 ——

    async toggleRepeatMode(): Promise<void> {
        await this.setup();
        const idx = REPEAT_CYCLE.indexOf(this.#repeatMode);
        const next = REPEAT_CYCLE[(idx + 1) % REPEAT_CYCLE.length];
        await this.#applyRepeatMode(next ?? RepeatMode.Queue);
    }

    async setRepeatMode(mode: RepeatMode): Promise<void> {
        await this.setup();
        await this.#applyRepeatMode(mode);
    }

    async setPauseAfterCurrent(enabled: boolean): Promise<void> {
        await this.setup();
        await this.#slots.setPauseAfterCurrent(enabled);
    }

    /** 应用循环模式（setup 已完成）：切入或退出随机模式时调整队列顺序并重算 next；不再 await setup，避免嵌套门控打乱命令顺序 */
    async #applyRepeatMode(mode: RepeatMode): Promise<void> {
        const prev = this.#repeatMode;
        if (mode === prev) {
            return;
        }
        this.#repeatMode = mode;
        publishRepeatMode(mode);
        this.#session.saveRepeatMode(mode);
        // 切换随机模式时调整队列顺序；当前曲按 identity 播放，不受下标变化影响
        // 模式已即时落盘，队列顺序必须跟上：低频操作直接 flush，避免崩溃窗口内留下「模式与顺序不符」的会话
        if (mode === RepeatMode.Shuffle) {
            this.#queue.shuffle();
            this.#commitQueue();
            this.#flushQueueSave();
        } else if (prev === RepeatMode.Shuffle) {
            this.#queue.restoreOrder();
            this.#commitQueue();
            this.#flushQueueSave();
        }
        await this.#slots.refreshNext();
    }

    async setPreferredQuality(quality: QualityKey): Promise<void> {
        await this.setup();
        if (quality === this.#preferredQuality) {
            return;
        }
        // 先占住 #preferredQuality 再写 config：MMKV 的变更回调是**同步**的
        // （HybridMMKV::set 内联 notifyOnValueChanged），不先占位的话回调会在这一行里
        // 抢先跑完整套重解析，本方法 await 到的却是个空操作，调用方拿不到真正的完成时机
        this.#preferredQuality = quality;
        this.#config.set('basic.defaultPlayQuality', quality);
        publishPreferredQuality(quality);
        await this.#reloadForPreferredQuality();
    }

    /**
     * 让已经改过的 #preferredQuality 落到正在播的这首上：重解析音源并跳回原位置
     * 只做「应用」，不碰真相源——写 config 由各入口自己负责
     * 重解析与跳回是 slots 内的同一个事务，中途插进来的切歌不会把新歌跳到旧位置
     */
    async #reloadForPreferredQuality(): Promise<void> {
        const resumePosition = this.#lastPosition;
        await this.#slots.reloadCurrentWithPreferredQuality(resumePosition);
        if (resumePosition > 0) {
            // 重解析期间引擎可能补发一个 position=0 的 tick 把账本带偏，这里对齐回来并落一次 checkpoint
            this.#lastPosition = resumePosition;
            this.#persistPosition(resumePosition);
        }
    }

    /** config 侧被别人改了（设置页 / 备份恢复）：同步运行态并落到当前这首上 */
    #syncPreferredQualityFromConfig(): void {
        const next =
            this.#config.get('basic.defaultPlayQuality') ?? FALLBACK_QUALITY;
        if (next === this.#preferredQuality) {
            return;
        }
        this.#preferredQuality = next;
        publishPreferredQuality(next);
        this.#reloadForPreferredQuality().catch(() => undefined);
    }

    async setPlaybackRate(rate: number): Promise<void> {
        await this.setup();
        this.#playbackRate = rate;
        publishPlaybackRate(rate);
        this.#session.savePlaybackRate(rate);
        await this.#slots.setRate(rate);
    }

    // —— 查询 ——

    isCurrent(ref: MediaRef): boolean {
        return this.#currentMusic
            ? isSameMediaRef(this.#currentMusic, ref)
            : false;
    }

    getCurrentMusic(): MusicItem | null {
        return this.#currentMusic;
    }

    getProgress(): Progress {
        return readProgress();
    }

    getPlaybackState(): PlaybackState {
        return readPlaybackState();
    }

    getQueue(): readonly MusicItem[] {
        return this.#queue.items;
    }

    getCurrentIndex(): number {
        return this.#currentMusic
            ? this.#queue.indexOf(this.#currentMusic)
            : -1;
    }

    getRepeatMode(): RepeatMode {
        return this.#repeatMode;
    }

    getPreferredQuality(): QualityKey {
        return this.#preferredQuality;
    }

    getPlaybackRate(): number {
        return this.#playbackRate;
    }

    // —— 事件订阅 ——

    subscribeCurrentMusic(cb: (item: MusicItem | null) => void): () => void {
        this.#currentListeners.add(cb);
        cb(this.#currentMusic); // 订阅后立即回放当前值
        return () => {
            this.#currentListeners.delete(cb);
        };
    }

    subscribePlaybackStarted(cb: (item: MusicItem) => void): () => void {
        this.#startedListeners.add(cb);
        return () => {
            this.#startedListeners.delete(cb);
        };
    }

    subscribePlaybackState(cb: (state: PlaybackState) => void): () => void {
        this.#stateListeners.add(cb);
        cb(readPlaybackState()); // 订阅后立即回放当前值
        return () => {
            this.#stateListeners.delete(cb);
        };
    }

    subscribePauseAfterCurrent(cb: (enabled: boolean) => void): () => void {
        this.#pauseAfterCurrentListeners.add(cb);
        cb(this.#pauseAfterCurrent); // 订阅后立即回放当前值
        return () => {
            this.#pauseAfterCurrentListeners.delete(cb);
        };
    }

    setCustomNotificationButtons(buttons: CustomNotificationButtons): void {
        audioEngine.setCustomNotificationButtons(buttons);
    }

    subscribeCustomNotificationButton(
        cb: (button: CustomNotificationButtonId) => void,
    ): () => void {
        return audioEngine.onCustomNotificationButton(cb);
    }

    subscribeProgress(cb: (progress: Progress) => void): () => void {
        this.#progressListeners.add(cb);
        return () => {
            this.#progressListeners.delete(cb);
        };
    }

    subscribeError(cb: (error: PlayerError) => void): () => void {
        this.#errorListeners.add(cb);
        return () => {
            this.#errorListeners.delete(cb);
        };
    }

    // —— 会话恢复 ——

    async #restoreSession(): Promise<void> {
        const restored = this.#session.read();
        this.#repeatMode = restored.repeatMode;
        publishRepeatMode(restored.repeatMode);
        this.#playbackRate = restored.playbackRate;
        publishPlaybackRate(restored.playbackRate);

        this.#queue.replace(
            restored.queue,
            restored.currentMusic ?? undefined,
            restored.queueOriginalOrder,
        );
        // 非随机模式却恢复出乱序队列（上次退出随机后未及落盘等）时就地归位，使模式与顺序自洽
        if (restored.repeatMode !== RepeatMode.Shuffle) {
            this.#queue.restoreOrder();
        }
        publishQueue(this.#queue.items);

        if (restored.playbackRate !== 1) {
            await this.#slots.setRate(restored.playbackRate);
        }
        if (!restored.currentMusic) {
            return;
        }
        // 先以 paused 状态加载并跳到上次位置，再由 autoPlayWhenAppStart 决定是否续播，避免从 0 开始播放时出现瞬跳
        await this.#slots.load(restored.currentMusic);
        // 显示用 optimistic mirror：暂停恢复期间引擎尚未 tick，先让 UI 显示已恢复的位置与时长
        // 时长优先取上次落盘的引擎实测值，回退到 MusicItem 自带 duration（插件常缺省），避免总时长显示 00:00
        // 就地收敛成权威时长：load 触发的 onCurrentChange 可能把已存时长覆写成 MusicItem hint，这里把权威值再写回
        restored.duration = this.#session.saveDuration(
            restored.duration || (restored.currentMusic.duration ?? 0),
        );
        this.#lastSavedDuration = restored.duration;
        publishProgress({
            position: restored.position,
            duration: restored.duration,
            buffered: 0,
        });
        if (restored.position > 0) {
            await this.#slots.seekTo(restored.position);
            this.#lastPosition = restored.position;
            this.#persistPosition(restored.position);
        }
        if (this.#config.get('basic.autoPlayWhenAppStart') ?? false) {
            await this.#slots.resume();
        }
    }

    // —— SlotController 回调 ——

    #handleCurrentChange = (item: MusicItem | null): void => {
        this.#currentMusic = item;
        this.#embeddedArtworkUri = null;
        this.#lastPosition = 0;
        publishCurrentMusic(item); // 进度镜像立即归零，否则切歌瞬间 UI 仍显示上一首位置，直到下个 onProgress
        // 时长基准跟随新曲（等引擎 tick 补真实值）；用规范化落盘值同步镜像与基准
        const nextDuration = this.#session.saveDuration(item?.duration ?? 0);
        this.#lastSavedDuration = nextDuration;
        publishProgress({
            position: 0,
            duration: nextDuration,
            buffered: 0,
        });
        this.#session.saveCurrentMusic(item);
        this.#persistPosition(0); // 切歌 checkpoint：新曲从头开始
        this.#currentListeners.forEach(cb => cb(item));
        // 切歌落定后回填已缓存的补充信息：补上无缝晋升窗口（onStarted 早于本回调、当时 #currentMusic 未提交而被放弃的 enrich）
        if (item) {
            const cached = this.#musicInfoCache.get(mediaKey(item));
            if (cached) {
                this.#applyMusicInfo(item, cached);
            }
        }
    };

    #handlePlaybackStarted = (item: MusicItem): void => {
        this.#startedListeners.forEach(cb => cb(item));
        // 真正开播后异步补充显示信息（封面 / 歌手 / 专辑等），失败不影响播放
        this.#enrichNowPlaying(item);
    };

    /**
     * 原生从码流里解出的内嵌封面（WebDAV / 直链这类插件通常不给封面，通知栏却早就显示了它）：
     * 只补没有封面的曲目——插件 getMusicInfo 给的封面优先。
     * 不写进 #musicInfoCache：那张表里「有条目」被 #enrichNowPlaying 当作「插件信息已拉过」，写进去会让
     * getMusicInfo 整首不再调用；原生每次 load 都重发，切歌回来照样补得上，缓存文件被清也随下一次 load 自愈。
     * 也不下发给原生元数据（通知栏本就靠码流里的 artworkData 出图）：一旦进了槽的 item，换音质重建槽时原生
     * 看到 artwork 非空就不再解析，缓存文件被清后会留一条死链。
     * 本地歌不走这条：它们的内嵌封面由 localPlugin.getMusicInfo 经 TagLib 提取、有自己的缓存约定，两套并存只多一份重复文件
     */
    #handleEmbeddedArtwork = (item: MusicItem, uri: string): void => {
        if (item.artwork || isLocalPlatform(item.platform)) {
            return;
        }
        if (this.#musicInfoCache.get(mediaKey(item))?.artwork) {
            return;
        }
        const current = this.#currentMusic;
        if (current && isSameMediaRef(current, item) && current.artwork) {
            return;
        }
        this.#embeddedArtworkUri = uri;
        this.#applyMusicInfo(item, { artwork: uri }, { syncNative: false });
    };

    #handlePauseAfterCurrentChange = (enabled: boolean): void => {
        this.#pauseAfterCurrent = enabled;
        this.#pauseAfterCurrentListeners.forEach(cb => cb(enabled));
    };

    #handleStateChange = (state: PlaybackState): void => {
        publishPlaybackState(state);
        this.#stateListeners.forEach(cb => cb(state));
        if (state === PlaybackState.Paused) {
            this.#persistPosition(this.#lastPosition); // 暂停 checkpoint
        }
    };

    #handleProgress = (progress: Progress): void => {
        this.#lastPosition = progress.position;
        // 时长首次已知 / 变化时落盘：恢复暂停态没有 tick，靠它显示正确总时长（每曲一次，值不变不重复写）
        if (
            progress.duration > 0 &&
            progress.duration !== this.#lastSavedDuration
        ) {
            this.#lastSavedDuration = this.#session.saveDuration(
                progress.duration,
            );
        }
        // 原生 seek/受理态会补发 duration=0 的迟到 tick（命令 Promise 表示已受理、非媒体已就绪）；
        // 时长未知时沿用本曲已知时长，避免把恢复态/播放中的总时长瞬时覆盖成 00:00（切歌已重置基准，不串上一曲）
        const resolved =
            progress.duration > 0
                ? progress
                : { ...progress, duration: this.#lastSavedDuration };
        publishProgress(resolved);
        // 节流 checkpoint：连续播放每前进约 POSITION_SAVE_INTERVAL_SEC 落盘一次
        // 兜住崩溃 / 被杀 / 长后台自动推进丢失曲内进度（暂停 / seek / 切歌 / 切后台仍即时落盘）
        if (
            Math.abs(progress.position - this.#lastSavedPosition) >=
            POSITION_SAVE_INTERVAL_SEC
        ) {
            this.#persistPosition(progress.position);
        }
        this.#progressListeners.forEach(cb => cb(resolved));
    };

    #handleError = (error: PlayerError): void => {
        this.#errorListeners.forEach(cb => cb(error));
    };

    /**
     * 开播后补充当前曲显示信息：经插件 getMusicInfo 拿封面 / 歌手 / 专辑等
     * 异步渐进增强、不参与音源解析；本地歌走 localPlugin 提取内嵌封面
     */
    async #enrichNowPlaying(item: MusicItem): Promise<void> {
        try {
            const key = mediaKey(item);
            const cached = this.#musicInfoCache.get(key);
            if (cached) {
                this.#applyMusicInfo(item, cached);
                return;
            }
            const plugin = this.#pluginManager.getByMediaItem(item);
            if (!plugin?.supportedMethods.has('getMusicInfo')) {
                return;
            }
            const patch = await plugin.methods.getMusicInfo(item);
            if (!patch || Object.keys(patch).length === 0) {
                return;
            }
            this.#cacheMusicInfo(key, patch);
            this.#applyMusicInfo(item, patch);
        } catch {
            // 补充失败静默放弃、不影响播放（含插件查找 / 能力读取 / 订阅者回调抛错）
        }
    }

    /** 写补充信息缓存并施加 FIFO 上限：新增导致超限时淘汰最早写入项（Map 迭代序 = 插入序） */
    #cacheMusicInfo(key: string, patch: Partial<MusicItem>): void {
        if (
            this.#musicInfoCache.size >= MUSIC_INFO_CACHE_LIMIT &&
            !this.#musicInfoCache.has(key)
        ) {
            const oldest = this.#musicInfoCache.keys().next().value;
            if (oldest !== undefined) {
                this.#musicInfoCache.delete(oldest);
            }
        }
        this.#musicInfoCache.set(key, patch);
    }

    /**
     * 合并补充信息进当前曲并推送：仅当仍是同一首（补充期间可能已切歌）
     * 生成新对象、不 mutate 队列快照；身份与音源锚点（platform/id/url）始终保当前曲，插件不得改
     * 不覆盖 duration：时长归引擎实测（progress），避免与 getMusicInfo hint 形成双源
     */
    #applyMusicInfo(
        item: MusicItem,
        patch: Partial<MusicItem>,
        { syncNative = true }: { syncNative?: boolean } = {},
    ): void {
        const current = this.#currentMusic;
        if (!current || !isSameMediaRef(current, item)) {
            return;
        }
        const merged: MusicItem = {
            ...current,
            ...patch,
            platform: current.platform,
            id: current.id,
            url: current.url,
            duration: current.duration,
        };
        this.#currentMusic = merged;
        publishCurrentMusic(merged);
        this.#currentListeners.forEach(cb => cb(merged));
        if (!syncNative) {
            return;
        }
        // 同步通知栏 / 锁屏元数据；内嵌封面的缓存文件地址不进槽（见 #handleEmbeddedArtwork），此处剥掉
        const forNative =
            merged.artwork && merged.artwork === this.#embeddedArtworkUri
                ? { ...merged, artwork: '' }
                : merged;
        this.#slots.updateCurrentMeta(forNative);
    }

    #handleAppStateChange = (state: AppStateStatus): void => {
        if (state === 'background' || state === 'inactive') {
            this.#persistPosition(this.#lastPosition); // 切后台 checkpoint
            this.#flushQueueSave(); // 去抖窗口未到也先落盘，避免进程被回收丢队列
        }
    };

    /** 落盘播放位置并同步节流基准：所有位置持久化（checkpoint + 节流）的单一入口；基准取实际落盘值，避免非有限输入毒化节流判断 */
    #persistPosition(seconds: number): void {
        this.#lastSavedPosition = this.#session.savePosition(seconds);
    }

    /** 队列变更后的统一处理：推送 atom 并落盘（前台去抖、后台直落） */
    #commitQueue(): void {
        const items = this.#queue.items;
        publishQueue(items);
        this.#pendingQueue = items;
        // 后台没有交互可卡，且原生定时器在 deep sleep 无 wakelock 时会停摆、进程被杀更是不触发
        // → 后台（含通知栏等外部入口发起的变更）一律直接落盘，不留会静默丢失的挂起写
        if (AppState.currentState === 'active') {
            this.#scheduleQueueSave();
        } else {
            this.#flushQueueSave();
        }
    }

    /** 排一次去抖落盘并重置等待窗口；等待走 background timer，切后台的 flush 万一没赶上仍有机会触发 */
    #scheduleQueueSave(): void {
        this.#queueSaveAbort?.abort();
        const controller = new AbortController();
        this.#queueSaveAbort = controller;
        delay(QUEUE_SAVE_DEBOUNCE_MS, {
            runInBackground: true,
            signal: controller.signal,
        }).then(
            () => {
                // 期间无新变更才由本轮落盘；否则交给接管的那一轮
                if (this.#queueSaveAbort === controller) {
                    this.#queueSaveAbort = null;
                    this.#writePendingQueue();
                }
            },
            () => {
                // abort：更晚的变更或立即 flush 已接管
            },
        );
    }

    /** 立即落盘挂起的队列快照：中止等待中的去抖，无挂起为 no-op */
    #flushQueueSave(): void {
        this.#queueSaveAbort?.abort();
        this.#queueSaveAbort = null;
        this.#writePendingQueue();
    }

    #writePendingQueue(): void {
        const pending = this.#pendingQueue;
        if (pending !== null) {
            this.#pendingQueue = null;
            // 原始名次在落盘时才算：所有队列变更都经 #commitQueue，此刻队列内容与挂起快照一致，
            // 于是每个去抖窗口最多算一次，逐首删歌不会每次都为整队排序
            this.#session.saveQueue(pending, this.#queue.originalOrder);
        }
    }
}

/** 将单个或数组入参统一为数组 */
function toArray(items: MusicItem | MusicItem[]): MusicItem[] {
    return Array.isArray(items) ? items : [items];
}

/** 裸对象 live-binding：供 UX / core 读写，由 app/container 装配 */
export let player: IPlayer;

/** 仅供 app/container 调用：装配 player 单例 */
export function providePlayer(instance: IPlayer): void {
    player = instance;
}

export { PlaybackState } from '@/native/audioEngine';
export { RepeatMode } from './types';
export type {
    IPlayer,
    PlayerDeps,
    PlayerError,
    PlayerErrorCode,
    PlayOptions,
} from './types';
export {
    useCurrentMusic,
    useDuration,
    usePlaybackRate,
    usePlaybackState,
    usePreferredQuality,
    useProgress,
    useQueue,
    useRepeatMode,
} from './hooks';
