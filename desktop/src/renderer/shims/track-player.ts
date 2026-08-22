/**
 * react-native-track-player 桌面实现
 *
 * - HTML5 Audio 播放,支持本地文件(musicfree-local://)与远程音源(http/https 走主进程媒体代理)
 * - hls.js 支持 m3u8 音源
 * - MediaSession API 集成系统媒体键
 * - 播放状态推送到主进程 MPRIS(D-Bus)
 * - 完整复刻移动端 fake-audio / proposed-audio 双轨队列语义
 */
import { useEffect, useRef, useState } from "react";

// ---------------------------------------------------------------- 类型
export interface TrackBase {
    id?: string | number;
    url: string;
    type?: string;
    headers?: Record<string, string>;
    duration?: number;
    title?: string;
    artist?: string;
    album?: string;
    artwork?: string | number | any;
    description?: string;
    [key: string]: any;
}
export type Track = TrackBase;
export type TrackMetadataBase = Partial<TrackBase>;
export interface Progress {
    position: number;
    duration: number;
    buffered: number;
}
export interface PlaybackState {
    state: State;
}
export interface UpdateOptions {
    [key: string]: any;
}

export enum State {
    None = "none",
    Ready = "ready",
    Buffering = "buffering",
    Loading = "loading",
    Playing = "playing",
    Paused = "paused",
    Stopped = "stopped",
    Error = "error",
    Connecting = "connecting",
}

export enum Event {
    PlaybackState = "playback-state",
    PlaybackError = "playback-error",
    PlaybackProgressUpdated = "playback-progress-updated",
    PlaybackActiveTrackChanged = "playback-active-track-changed",
    PlaybackQueueEnded = "playback-queue-ended",
    PlaybackMetadataReceived = "playback-metadata-received",
    RemotePlay = "remote-play",
    RemotePlayId = "remote-play-id",
    RemotePause = "remote-pause",
    RemotePauseId = "remote-pause-id",
    RemoteStop = "remote-stop",
    RemoteStopId = "remote-stop-id",
    RemoteNext = "remote-next",
    RemoteNextId = "remote-next-id",
    RemotePrevious = "remote-previous",
    RemotePreviousId = "remote-previous-id",
    RemoteSeek = "remote-seek",
    RemoteSeekId = "remote-seek-id",
    RemoteSetRating = "remote-set-rating",
    RemoteSetRatingId = "remote-set-rating-id",
    RemoteJumpForward = "remote-jump-forward",
    RemoteJumpForwardId = "remote-jump-forward-id",
    RemoteJumpBackward = "remote-jump-backward",
    RemoteJumpBackwardId = "remote-jump-backward-id",
    RemoteDuck = "remote-duck",
    RemoteDuckId = "remote-duck-id",
    RemoteLike = "remote-like",
    RemoteDislike = "remote-dislike",
}

export enum Capability {
    Play = 1,
    PlayFromId = 2,
    PlayFromSearch = 3,
    Pause = 4,
    Stop = 5,
    SeekTo = 6,
    Skip = 7,
    SkipToNext = 8,
    SkipToPrevious = 9,
    SetRating = 10,
    JumpForward = 11,
    JumpBackward = 12,
    Like = 13,
    Dislike = 14,
}

export enum AppKilledPlaybackBehavior {
    ContinuePlayback = 0,
    PausePlayback = 1,
    StopPlaybackAndRemoveNotification = 2,
}

export enum RepeatMode {
    Off = 0,
    Track = 1,
    Queue = 2,
}

type EventListener = (event: any) => void;

// ---------------------------------------------------------------- 工具
declare global {
    interface Window {
        __MUSICFREE_DESKTOP__?: any;
    }
}

const bridge = typeof window !== "undefined" ? window.__MUSICFREE_DESKTOP__ : undefined;

const FAKE_URL_PREFIX = "musicfree://";

/** 本地 file:// 转为 musicfree-local:// 协议 */
function toPlayableUrl(url: string): string {
    if (!url) return "";
    if (url.startsWith("file://")) {
        const p = decodeURIComponent(url.slice("file://".length));
        return `musicfree-local://p/${encodeURIComponent(p)}`;
    }
    return url;
}

function isHls(track: Track): boolean {
    return (
        track?.type === "hls" ||
        /\.m3u8(\?|#|$)/i.test(track?.url ?? "")
    );
}

function isFakeUrl(url?: string): boolean {
    return !!url && url.startsWith(FAKE_URL_PREFIX);
}

// ---------------------------------------------------------------- 播放器内核
class DesktopTrackPlayer {
    private audio: HTMLAudioElement;
    private hls: any = null;
    private queue: Track[] = [];
    private activeIndex: number | null = null;
    private listeners = new Map<Event, Set<EventListener>>();
    private _state: State = State.None;
    private initialized = false;
    private progressTimer: number | null = null;
    private pendingSeek: number | null = null;
    private serviceStarted = false;
    private volume = 1;
    private rate = 1;
    private lastMprisPosition = 0;

    constructor() {
        this.audio = new Audio();
        this.audio.preload = "metadata";
        this.bindAudioEvents();
    }

    // ------------------------------------------------------------ 事件
    addEventListener(event: Event, listener: EventListener) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }
        this.listeners.get(event)!.add(listener);
        return {
            remove: () => {
                this.listeners.get(event)?.delete(listener);
            },
        };
    }

    private emit(event: Event, payload?: any) {
        this.listeners.get(event)?.forEach((fn) => {
            try {
                fn(payload);
            } catch (e) {
                console.error(`[track-player] listener error(${event})`, e);
            }
        });
    }

    private setState(next: State) {
        if (this._state === next) return;
        this._state = next;
        this.emit(Event.PlaybackState, { state: next });
    }

    // ------------------------------------------------------------ 音频事件
    private bindAudioEvents() {
        const audio = this.audio;

        audio.addEventListener("loadstart", () => {
            this.setState(State.Loading);
        });
        audio.addEventListener("durationchange", () => {
            this.emit(Event.PlaybackMetadataReceived, {
                duration: audio.duration,
                track: this.getActiveTrack(),
            });
        });
        audio.addEventListener("loadedmetadata", () => {
            if (this.pendingSeek !== null) {
                try {
                    audio.currentTime = this.pendingSeek;
                } catch {
                    // ignore
                }
                this.pendingSeek = null;
            }
        });
        audio.addEventListener("canplay", () => {
            this.setState(State.Ready);
        });
        audio.addEventListener("playing", () => {
            this.setState(State.Playing);
            this.pushMpris();
        });
        audio.addEventListener("pause", () => {
            if (this._state !== State.Stopped) {
                this.setState(State.Paused);
            }
            this.pushMpris();
        });
        audio.addEventListener("waiting", () => {
            if (this._state === State.Playing || this._state === State.Loading) {
                this.setState(State.Buffering);
            }
        });
        audio.addEventListener("ended", () => {
            this.handleEnded();
        });
        audio.addEventListener("error", () => {
            const err = (audio as any).error;
            if (isFakeUrl(this.getActiveTrackSync()?.url)) {
                // fake 音轨不视为错误
                return;
            }
            this.setState(State.Error);
            this.emit(Event.PlaybackError, {
                message: err?.message ?? "playback error",
                code: err?.code,
            });
        });
        audio.addEventListener("timeupdate", () => {
            this.lastMprisPosition = audio.currentTime;
        });

        this.setupMediaSession();
    }

    /** 队列播放结束:进入下一轨(fake 音轨由上层接管) */
    private handleEnded() {
        const lastIndex = this.activeIndex;
        if (
            this.activeIndex !== null &&
            this.activeIndex < this.queue.length - 1
        ) {
            const nextIndex = this.activeIndex + 1;
            this.setActiveIndex(nextIndex, { autoload: false });
            this.setState(State.Stopped);
            this.emit(Event.PlaybackActiveTrackChanged, {
                index: nextIndex,
                lastIndex,
                track: this.queue[nextIndex],
                lastTrack: lastIndex != null ? this.queue[lastIndex] : undefined,
                position: 0,
                lastPosition: this.audio.currentTime,
            });
        } else {
            // 队列结束
            this.setState(State.Stopped);
            this.emit(Event.PlaybackQueueEnded, {
                track: this.getActiveTrack(),
                position: this.audio.currentTime,
            });
            this.emit(Event.PlaybackActiveTrackChanged, {
                index: null,
                lastIndex,
                track: null,
                lastTrack: this.queue[lastIndex ?? 0],
                position: 0,
                lastPosition: this.audio.currentTime,
            });
        }
        this.pushMpris();
    }

    // ------------------------------------------------------------ MediaSession
    // MediaSessionAction 是 TS 类型而非运行时枚举,这里用规范字符串字面量
    private static readonly MEDIA_ACTIONS = {
        Play: "play",
        Pause: "pause",
        PlayPause: "playpause",
        PreviousTrack: "previoustrack",
        NextTrack: "nexttrack",
        Stop: "stop",
        SeekTo: "seekto",
        SeekBackward: "seekbackward",
        SeekForward: "seekforward",
    } as const;

    private setupMediaSession() {
        if (typeof navigator === "undefined" || !("mediaSession" in navigator)) {
            return;
        }
        const ms = navigator.mediaSession;
        const A = DesktopTrackPlayer.MEDIA_ACTIONS;
        const setAction = (action: string, fn: (() => void) | any) => {
            try {
                ms.setActionHandler(action as any, fn as any);
            } catch {
                // 部分动作不受支持
            }
        };
        setAction(A.Play, () =>
            this.emit(Event.RemotePlay, { }),
        );
        setAction(A.Pause, () =>
            this.emit(Event.RemotePause, { }),
        );
        setAction(A.PlayPause, () => {
            if (this._state === State.Playing) {
                this.emit(Event.RemotePause, {});
            } else {
                this.emit(Event.RemotePlay, {});
            }
        });
        setAction(A.PreviousTrack, () =>
            this.emit(Event.RemotePrevious, { }),
        );
        setAction(A.NextTrack, () =>
            this.emit(Event.RemoteNext, { }),
        );
        setAction(A.Stop, () =>
            this.emit(Event.RemoteStop, { }),
        );
        setAction(A.SeekTo, (details: any) =>
            this.emit(Event.RemoteSeek, { position: details.seekTime }),
        );
        setAction(A.SeekBackward, () =>
            this.emit(Event.RemoteJumpBackward, { interval: 10 }),
        );
        setAction(A.SeekForward, () =>
            this.emit(Event.RemoteJumpForward, { interval: 10 }),
        );
    }

    private updateMediaSessionMetadata() {
        if (typeof navigator === "undefined" || !("mediaSession" in navigator)) {
            return;
        }
        const track = this.getActiveTrackSync();
        if (!track) {
            navigator.mediaSession.metadata = null;
            return;
        }
        let artwork: string | undefined;
        if (typeof track.artwork === "string" && track.artwork) {
            artwork = track.artwork;
            if (artwork.startsWith("file://")) {
                artwork = toPlayableUrl(artwork);
            }
            try {
                artwork = new URL(artwork, window.location.href).toString();
            } catch {
                // 保留原样
            }
        }
        try {
            navigator.mediaSession.metadata = new MediaMetadata({
                title: track.title ?? "未知标题",
                artist: track.artist ?? "未知歌手",
                album: track.album ?? "",
                artwork: artwork ? [{ src: artwork }] : [],
            });
        } catch {
            // ignore
        }
        const playing = this._state === State.Playing;
        try {
            navigator.mediaSession.playbackState = playing
                ? "playing"
                : "paused";
        } catch {
            // ignore
        }
    }

    /** 推送 MPRIS 状态(主进程 D-Bus) */
    private pushMpris() {
        if (!bridge?.mpris) return;
        const track = this.getActiveTrackSync();
        const state = this._state;
        let artUrl = "";
        if (typeof track?.artwork === "string") {
            artUrl = track.artwork;
            if (artUrl.startsWith("file://")) {
                artUrl = toPlayableUrl(artUrl);
            }
            try {
                artUrl = new URL(artUrl, window.location.href).toString();
            } catch {
                // ignore
            }
        }
        bridge.mpris.update({
            playbackStatus:
                state === State.Playing ? "Playing" : state === State.Paused ? "Paused" : "Stopped",
            position: this.audio.currentTime || 0,
            metadata: {
                trackId:
                    track?.id != null
                        ? `/org/mpris/MediaPlayer2/TrackList/${encodeURIComponent(String(track.id))}`
                        : undefined,
                title: track?.title ?? "",
                artist: track?.artist ?? "",
                album: track?.album ?? "",
                artUrl,
                url: track?.url ?? "",
                duration: this.audio.duration || track?.duration || 0,
            },
        });
    }

    // ------------------------------------------------------------ 生命周期
    async setupPlayer(_options?: any): Promise<void> {
        if (this.initialized) {
            throw new Error(
                "The player has already been initialized via setupPlayer.",
            );
        }
        this.initialized = true;
        this.setState(State.Ready);

        // 启动播放服务(等价移动端 registerPlaybackService)
        if (!this.serviceStarted) {
            this.serviceStarted = true;
            try {
                const mod: any = await import("../../../../src/service/index");
                const fn = mod.default ?? mod;
                if (typeof fn === "function") {
                    await fn();
                }
            } catch (e) {
                console.error("[track-player] service setup failed", e);
            }
        }

        // 进度事件(1s,与移动端 progressUpdateEventInterval 一致)
        if (this.progressTimer === null) {
            this.progressTimer = window.setInterval(() => {
                if (this._state !== State.None && this.activeIndex !== null) {
                    this.emit(Event.PlaybackProgressUpdated, {
                        position: this.audio.currentTime,
                        buffered: this.getBuffered(),
                        duration: this.getDuration(),
                        track: this.getActiveTrack(),
                    });
                }
            }, 1000);
        }
    }

    async updateOptions(_options?: UpdateOptions): Promise<void> {
        // 桌面端无通知栏,能力声明由 MPRIS/MediaSession 承担
    }

    // ------------------------------------------------------------ 队列操作
    private setActiveIndex(
        index: number | null,
        options: { autoload?: boolean; fireEvent?: boolean } = {},
    ) {
        const { autoload = true, fireEvent = true } = options;
        const lastIndex = this.activeIndex;
        this.activeIndex = index;
        if (index !== null && autoload) {
            this.loadCurrentTrack();
        }
        if (fireEvent) {
            this.emit(Event.PlaybackActiveTrackChanged, {
                index,
                lastIndex,
                track: index !== null ? this.queue[index] : undefined,
                lastTrack: lastIndex != null ? this.queue[lastIndex] : undefined,
                position: 0,
                lastPosition: this.audio.currentTime,
            });
        }
    }

    private loadCurrentTrack(autoplay?: boolean) {
        const track = this.getActiveTrack();
        if (!track) {
            this.audio.removeAttribute("src");
            this.audio.load();
            return;
        }
        this.destroyHls();
        this.pendingSeek = null;

        if (isFakeUrl(track.url)) {
            // proposed/fake 音轨:不加载,等待上层替换
            this.audio.removeAttribute("src");
            return;
        }

        const url = toPlayableUrl(track.url);
        if (isHls(track) && !this.audio.canPlayType("application/vnd.apple.mpegurl")) {
            this.attachHls(url);
        } else {
            this.audio.src = url;
        }
        if (autoplay) {
            this.play();
        }
    }

    private async attachHls(url: string) {
        try {
            const { default: Hls } = await import("hls.js");
            if (!Hls.isSupported()) {
                this.audio.src = url;
                return;
            }
            this.hls = new Hls({ enableWorker: true });
            this.hls.attachMedia(this.audio);
            this.hls.loadSource(url);
            this.hls.on(Hls.Events.ERROR, (_evt: any, data: any) => {
                if (data?.fatal) {
                    this.setState(State.Error);
                    this.emit(Event.PlaybackError, {
                        message: data.details ?? "hls error",
                        code: data.type,
                    });
                }
            });
        } catch (e) {
            console.error("[track-player] hls load failed", e);
            this.audio.src = url;
        }
    }

    private destroyHls() {
        if (this.hls) {
            try {
                this.hls.destroy();
            } catch {
                // ignore
            }
            this.hls = null;
        }
    }

    async setQueue(tracks: Track[]): Promise<void> {
        const wasPlaying =
            this._state === State.Playing || this._state === State.Buffering;
        this.queue = tracks.map((t) => ({ ...t }));
        const index = tracks.length > 0 ? 0 : null;
        const lastIndex = this.activeIndex;
        this.activeIndex = index;
        if (index === null) {
            this.audio.removeAttribute("src");
            this.audio.load();
            this.setState(State.Ready);
        } else {
            this.loadCurrentTrack(wasPlaying);
        }
        this.emit(Event.PlaybackActiveTrackChanged, {
            index,
            lastIndex,
            track: this.queue[0],
            lastTrack: lastIndex != null ? this.queue[lastIndex] : undefined,
            position: 0,
            lastPosition: this.audio.currentTime,
        });
        this.updateMediaSessionMetadata();
        this.pushMpris();
    }

    async add(tracks: Track | Track[], insertBeforeIndex?: number): Promise<void> {
        const list = Array.isArray(tracks) ? tracks : [tracks];
        if (insertBeforeIndex == null || insertBeforeIndex < 0 || insertBeforeIndex > this.queue.length) {
            this.queue.push(...list);
        } else {
            this.queue.splice(insertBeforeIndex, 0, ...list);
        }
        if (this.activeIndex === null && this.queue.length > 0) {
            this.setActiveIndex(0, { autoload: false });
        }
    }

    async remove(indexOrIndices: number | number[]): Promise<void> {
        const indices = Array.isArray(indexOrIndices) ? indexOrIndices : [indexOrIndices];
        const active = this.activeIndex;
        const removedBefore = indices.filter((i) => i < (active ?? 0)).length;
        this.queue = this.queue.filter((_t, i) => !indices.includes(i));
        if (active !== null) {
            if (indices.includes(active)) {
                this.setActiveIndex(0, { autoload: false });
            } else {
                this.activeIndex = active - removedBefore;
            }
        }
    }

    async skip(index: number): Promise<void> {
        if (index < 0 || index >= this.queue.length) {
            throw new Error(`The track index is out of bounds`);
        }
        const wasPlaying = this._state !== State.Paused && this._state !== State.Stopped;
        this.setActiveIndex(index, { autoload: false });
        this.loadCurrentTrack(wasPlaying);
        this.updateMediaSessionMetadata();
        this.pushMpris();
    }

    async updateMetadataForTrack(
        index: number,
        metadata: TrackMetadataBase,
    ): Promise<void> {
        if (index < 0 || index >= this.queue.length) return;
        this.queue[index] = { ...this.queue[index], ...metadata };
        if (this.activeIndex === index) {
            this.updateMediaSessionMetadata();
            this.pushMpris();
        }
    }

    // ------------------------------------------------------------ 播放控制
    async play(): Promise<void> {
        const track = this.getActiveTrack();
        if (track && isFakeUrl(track.url)) {
            return; // fake 音轨不播放
        }
        if (!this.audio.src && !this.hls && track) {
            this.loadCurrentTrack(true);
            return;
        }
        try {
            await this.audio.play();
        } catch (e: any) {
            if (e?.name === "NotAllowedError") {
                console.warn("[track-player] autoplay blocked");
            } else if (e?.name !== "AbortError") {
                this.emit(Event.PlaybackError, {
                    message: e?.message ?? "play error",
                });
            }
        }
    }

    async pause(): Promise<void> {
        this.audio.pause();
    }

    async stop(): Promise<void> {
        this.audio.pause();
        try {
            this.audio.currentTime = 0;
        } catch {
            // ignore
        }
        this.setState(State.Stopped);
        this.pushMpris();
    }

    async reset(): Promise<void> {
        this.destroyHls();
        this.queue = [];
        this.activeIndex = null;
        this.audio.removeAttribute("src");
        this.audio.load();
        this.setState(State.Ready);
        this.updateMediaSessionMetadata();
        this.pushMpris();
    }

    async seekTo(seconds: number): Promise<void> {
        if (!isFinite(seconds) || seconds < 0) return;
        const duration = this.getDuration();
        const target = duration ? Math.min(seconds, duration) : seconds;
        try {
            if (this.audio.readyState === 0 || !this.audio.src) {
                this.pendingSeek = target;
                this.audio.load();
            } else {
                this.audio.currentTime = target;
            }
        } catch {
            this.pendingSeek = target;
        }
    }

    async setVolume(volume: number): Promise<void> {
        this.volume = Math.max(0, Math.min(1, volume));
        this.audio.volume = this.volume;
    }

    async getVolume(): Promise<number> {
        return this.volume;
    }

    async setRate(rate: number): Promise<void> {
        this.rate = rate;
        try {
            this.audio.playbackRate = rate;
        } catch {
            // ignore
        }
    }

    async getRate(): Promise<number> {
        return this.rate;
    }

    async setRepeatMode(_repeatMode: RepeatMode): Promise<void> {
        // repeat 由上层 TrackPlayer 管理
    }

    async getRepeatMode(): Promise<RepeatMode> {
        return RepeatMode.Off;
    }

    // ------------------------------------------------------------ 状态查询
    private getBuffered(): number {
        try {
            const b = this.audio.buffered;
            if (b.length > 0) {
                return b.end(b.length - 1);
            }
        } catch {
            // ignore
        }
        return 0;
    }

    private getDuration(): number {
        const d = this.audio.duration;
        if (isFinite(d) && d > 0) return d;
        const track = this.getActiveTrack();
        if (track?.duration && isFinite(Number(track.duration))) {
            return Number(track.duration);
        }
        return 0;
    }

    async getProgress(): Promise<Progress> {
        return {
            position: this.audio.currentTime || 0,
            duration: this.getDuration(),
            buffered: this.getBuffered(),
        };
    }

    async getBufferedPosition(): Promise<number> {
        return this.getBuffered();
    }

    async getPosition(): Promise<number> {
        return this.audio.currentTime || 0;
    }

    async getPlaybackState(): Promise<PlaybackState> {
        return { state: this._state };
    }

    async getQueue(): Promise<Track[]> {
        return this.queue.map((t) => ({ ...t }));
    }

    async getTrack(index: number): Promise<Track | undefined> {
        const track = this.queue[index];
        return track ? { ...track } : undefined;
    }

    async getActiveTrack(): Promise<Track | undefined> {
        return await this.getTrack(this.activeIndex ?? -1);
    }

    async getActiveTrackIndex(): Promise<number | null> {
        return this.activeIndex;
    }

    /** 同步获取当前 track(内部事件用) */
    private getActiveTrackSync(): Track | undefined {
        if (this.activeIndex === null) return undefined;
        return this.queue[this.activeIndex];
    }

    getPlaybackStateSync(): PlaybackState {
        return { state: this._state };
    }
}

const player = new DesktopTrackPlayer();

// ---------------------------------------------------------------- React hooks
export function usePlaybackState(): PlaybackState {
    const [state, setState] = useState<PlaybackState>({
        state: State.None,
    });
    useEffect(() => {
        let mounted = true;
        player.getPlaybackState().then((s) => {
            if (mounted) setState(s);
        });
        const sub = player.addEventListener(Event.PlaybackState, (evt) => {
            if (mounted) setState({ state: evt.state });
        });
        return () => {
            mounted = false;
            sub.remove();
        };
    }, []);
    return state;
}

export function useProgress(updateInterval = 1): Progress {
    const [state, setState] = useState<Progress>({
        position: 0,
        duration: 0,
        buffered: 0,
    });
    const intervalRef = useRef(updateInterval);
    intervalRef.current = updateInterval;

    useEffect(() => {
        let mounted = true;
        const update = async () => {
            if (!mounted) return;
            try {
                const p = await player.getProgress();
                setState(p);
            } catch {
                // ignore
            }
        };
        update();
        // 事件驱动更新(1s 粒度)
        const sub = player.addEventListener(
            Event.PlaybackProgressUpdated,
            (evt) => {
                if (!mounted) return;
                setState({
                    position: evt.position,
                    duration: evt.duration,
                    buffered: evt.buffered,
                });
            },
        );
        const interval = window.setInterval(
            update,
            Math.max(0.25, intervalRef.current) * 1000,
        );
        return () => {
            mounted = false;
            sub.remove();
            window.clearInterval(interval);
        };
    }, [updateInterval]);
    return state;
}

export function useActiveTrack(): Track | undefined {
    const [track, setTrack] = useState<Track | undefined>(undefined);
    useEffect(() => {
        let mounted = true;
        player.getActiveTrack().then((t) => {
            if (mounted) setTrack(t);
        });
        const sub = player.addEventListener(
            Event.PlaybackActiveTrackChanged,
            (evt) => {
                if (mounted) setTrack(evt.track ? { ...evt.track } : undefined);
            },
        );
        return () => {
            mounted = false;
            sub.remove();
        };
    }, []);
    return track;
}

export function useIsPlaying(): boolean {
    const { state } = usePlaybackState();
    return state === State.Playing;
}

// ---------------------------------------------------------------- 导出
const TrackPlayer = {
    // 状态
    State,
    Event,
    Capability,
    AppKilledPlaybackBehavior,
    RepeatMode,

    // 生命周期
    setupPlayer: (o?: any) => player.setupPlayer(o),
    updateOptions: (o?: UpdateOptions) => player.updateOptions(o),

    // 队列
    add: (t: Track | Track[], i?: number) => player.add(t, i),
    remove: (i: number | number[]) => player.remove(i),
    setQueue: (t: Track[]) => player.setQueue(t),
    skip: (i: number) => player.skip(i),
    updateMetadataForTrack: (i: number, m: TrackMetadataBase) =>
        player.updateMetadataForTrack(i, m),

    // 播放控制
    play: () => player.play(),
    pause: () => player.pause(),
    stop: () => player.stop(),
    reset: () => player.reset(),
    seekTo: (s: number) => player.seekTo(s),
    seekBy: (offset: number) =>
        player.seekTo((player as any).audio?.currentTime + offset),
    setVolume: (v: number) => player.setVolume(v),
    getVolume: () => player.getVolume(),
    setRate: (r: number) => player.setRate(r),
    getRate: () => player.getRate(),
    setRepeatMode: (m: RepeatMode) => player.setRepeatMode(m),
    getRepeatMode: () => player.getRepeatMode(),

    // 查询
    getProgress: () => player.getProgress(),
    getBufferedPosition: () => player.getBufferedPosition(),
    getPosition: () => player.getPosition(),
    getPlaybackState: () => player.getPlaybackState(),
    getQueue: () => player.getQueue(),
    getTrack: (i: number) => player.getTrack(i),
    getActiveTrack: () => player.getActiveTrack(),
    getActiveTrackIndex: () => player.getActiveTrackIndex(),

    // 事件
    addEventListener: (e: Event, l: EventListener) =>
        player.addEventListener(e, l),

    // 桌面端专用:接收主进程媒体控制(托盘/MPRIS)
    __bindDesktopMediaControls() {
        if (!bridge?.events) return;
        bridge.events.on("media-control", (action: string, arg?: any) => {
            switch (action) {
                case "play":
                    player.emit(Event.RemotePlay, {});
                    break;
                case "pause":
                    player.emit(Event.RemotePause, {});
                    break;
                case "playpause":
                    player.emit(
                        player.getPlaybackStateSync().state === State.Playing
                            ? Event.RemotePause
                            : Event.RemotePlay,
                        {},
                    );
                    break;
                case "next":
                    player.emit(Event.RemoteNext, {});
                    break;
                case "previous":
                    player.emit(Event.RemotePrevious, {});
                    break;
                case "stop":
                    player.emit(Event.RemoteStop, {});
                    break;
                case "seek":
                    player.emit(Event.RemoteSeek, { position: arg });
                    break;
                case "seekTo":
                    player.emit(Event.RemoteSeek, { position: arg });
                    break;
                default:
                    break;
            }
        });
    },
};

// 绑定桌面媒体控制
TrackPlayer.__bindDesktopMediaControls();

export default TrackPlayer;
