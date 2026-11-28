import { delay } from '@/infra/timer';
import {
    audioEngine,
    AudioErrorCode,
    PlaybackState,
    RemoteCommand,
    StreamType,
    type AudioError,
    type AudioItem,
    type AudioSource,
    type Progress,
    type RemoteAction,
    type SetupOptions,
} from '@/native/audioEngine';
import { isLocalPlatform, isSameMediaRef, mediaKey } from '@/utils/media';

import { sourceCacheKey, type SourceCache } from './sourceCache';
import { RepeatMode, type PlayerError, type PlayOptions } from './types';

import type { PlayQueue } from './queue';
import type { SourceResolver } from './sourceResolver';
import type { MusicItem, QualityKey } from '@/types';

/** 出错跳下一首前的基础延迟（ms），连续失败时逐步延长 */
const ERROR_SKIP_DELAY_MS = 500;

const MAX_ERROR_SKIP_DELAY_MS = 4000;

/** 用户播放意图：重发/恢复槽时据此决定是否自动出声（并由 onStateChange 同步 native 远程改动） */
type Intent = 'playing' | 'paused' | 'stopped';

/** 槽记账：load occurrence 号 + 瘦 AudioItem + 完整 MusicItem + 音质 */
interface Slot {
    slotId: number;
    cacheKey: string;
    audioItem: AudioItem;
    item: MusicItem;
    quality: QualityKey;
    /** 本次 load occurrence 的首选文件；运行时态，不下发原生、不持久化 */
    preferredLocalPath?: string;
}

/** SlotController 回读 Player 态 + 上报状态的回调 */
export interface SlotHooks {
    getRepeatMode(): RepeatMode;
    getPreferredQuality(): QualityKey;
    /** 出错策略：true=停在本曲、false=跳下一首（读 config.basic.autoStopWhenError） */
    stopOnError(): boolean;
    /** 当前曲身份变化（含 null=停止 / 清空） */
    onCurrentChange(item: MusicItem | null): void;
    /** 一首歌真正开始播放（history 记这个；native onStarted 驱动、按 slotId occurrence 去重） */
    onPlaybackStarted(item: MusicItem): void;
    /** 原生从码流元数据里解出了某曲的内嵌封面（已落成 file:// 缓存文件）；由 Player 决定要不要用它补当前曲 */
    onEmbeddedArtwork(item: MusicItem, uri: string): void;
    onStateChange(state: PlaybackState): void;
    onProgress(progress: Progress): void;
    /** 「播完当前曲即停」标志变化（含被曲终消费）；仅在值真的变了时触发 */
    onPauseAfterCurrentChange(enabled: boolean): void;
    /** 播放最终失败（用户可感知，如畸形项无法下发）：上报供 UI 提示 */
    onError(error: PlayerError): void;
}

export interface SlotControllerDeps {
    resolver: SourceResolver;
    cache: SourceCache;
    queue: PlayQueue;
    hooks: SlotHooks;
}

/**
 * 两槽编排：把 Player 的「播这首 / 队列变了 / 切歌」翻译成引擎 setAudio/setNext
 * · 显式两槽账本（current/next），每槽带 slotId（load occurrence 号）；事件按 slotId 对账、不受同 cacheKey / 时序影响
 * · 所有命令 + 改槽操作走串行 reconciler（统一序列化、可线性化）
 * · streamType 主动纠正：resolver 检测类型不符即重发该槽（新 slotId）；旧 load 的错误按 slotId 自动忽略
 * · 错误恢复：按错误码最多重解析一次，否则读策略停 / 跳；跳过本轮已失败的歌曲，整队失败后停止
 * · onAudioEnd 照 native 回带的「实际晋升项」对账；onStarted 判「真正开播」
 */
export class SlotController {
    readonly #resolver: SourceResolver;
    readonly #cache: SourceCache;
    readonly #queue: PlayQueue;
    readonly #hooks: SlotHooks;

    #current: Slot | null = null;
    #next: Slot | null = null;
    /** 单调递增 slotId 分配器（从 1 起；勿 ≤0，原生缺省 -1 表「无」） */
    #slotSeq = 0;
    /** 用户播放意图；重发/恢复槽时决定 autoPlay，并由 onStateChange 同步 native 远程改动 */
    #intent: Intent = 'stopped';
    /** 本轮最终失败的歌曲身份；成功出声或用户主动播放操作后清空 */
    readonly #failedTracks = new Set<string>();
    /** 已按错误码重解析过一次的 cacheKey（防同一坏源反复重试）；onStarted / 用户命令清空 */
    readonly #retried = new Set<string>();
    /** 出错延迟跳的取消句柄（可取消：用户命令 / 暂停 / seek / dispose 时取消） */
    #skipAbort: AbortController | null = null;
    /**
     * 播完当前曲即停：一次性标志，置位期间**不把 next 下发给原生**
     * 必须靠「不给原生 next」实现，而非曲终再补救——onAudioEnd 到达时原生已晋升并出声，补救会漏出下一首
     * JS 侧 #next 账本照常维护，故取消标志时无需重算即可补发
     */
    #pauseAfterCurrent = false;
    /** dispose 后拒绝一切新命令 / native 写入 */
    #disposed = false;

    /** 串行 reconciler：命令与改槽操作按序执行；op 抛错被吞、链不断 */
    #chain: Promise<void> = Promise.resolve();
    #unsubs: Array<() => void> = [];

    constructor(deps: SlotControllerDeps) {
        this.#resolver = deps.resolver;
        this.#cache = deps.cache;
        this.#queue = deps.queue;
        this.#hooks = deps.hooks;
    }

    /** 初始化引擎 + 编织 resolver + 订阅事件（幂等由 Player 保证只调一次） */
    async setup(options?: Partial<SetupOptions>): Promise<void> {
        this.#unsubs.push(
            audioEngine.setSourceResolver(this.#resolveSource),
            audioEngine.onAudioEnd(this.#onAudioEnd),
            audioEngine.onStarted(this.#onStarted),
            audioEngine.onEmbeddedArtwork(this.#onEmbeddedArtwork),
            audioEngine.onError(this.#onError),
            audioEngine.onRemote(this.#onRemote),
            audioEngine.onStateChange(this.#onStateChange),
            audioEngine.onProgress(this.#onProgress),
        );
        await audioEngine.setup(options);
    }

    dispose(): void {
        this.#disposed = true;
        this.#cancelAutoSkip();
        this.#unsubs.forEach(u => u());
        this.#unsubs = [];
    }

    // —— Player 调的命令（全走 reconciler：与改槽操作统一序列化）——

    /** 播放某曲：设为 current 槽 + 算 next，下发两槽 */
    play(item: MusicItem, options?: PlayOptions): Promise<void> {
        return this.#reconcile(async () => {
            this.#onUserCommand();
            await this.#setCurrent(
                item,
                'playing',
                options?.preferredLocalPath,
            );
        });
    }

    /** 加载当前曲但不出声（会话恢复：autoPlayWhenAppStart=false 时载入于 paused） */
    load(item: MusicItem): Promise<void> {
        return this.#reconcile(async () => {
            this.#onUserCommand();
            await this.#setCurrent(item, 'paused');
        });
    }

    resume(): Promise<void> {
        return this.#reconcile(async () => {
            this.#onUserCommand();
            const wasStopped = this.#intent === 'stopped';
            this.#intent = 'playing';
            // 停止后恢复：stop 已释放解码缓冲 + position 归零，重建当前槽（应用最新首选音质）从头起播；
            // 暂停后恢复走 audioEngine.play() 原位续播。据权威 #intent 判定（reconciler 内串行，无状态回声竞态）
            if (wasStopped && this.#current) {
                const prevCurrent = this.#current;
                const prevNext = this.#next;
                const rebuilt = this.#makeSlot(
                    this.#current.item,
                    this.#hooks.getPreferredQuality(),
                    this.#current.preferredLocalPath,
                );
                this.#current = rebuilt;
                this.#next = this.#nextSlotFor(rebuilt.item);
                try {
                    await audioEngine.setAudio(
                        rebuilt.audioItem,
                        true,
                        this.#nextForNative(),
                    );
                } catch (e) {
                    this.#current = prevCurrent;
                    this.#next = prevNext;
                    this.#intent = 'stopped';
                    throw e;
                }
                return;
            }
            await audioEngine.play();
        });
    }

    pause(): Promise<void> {
        return this.#reconcile(async () => {
            this.#onUserCommand();
            this.#intent = 'paused';
            await audioEngine.pause();
        });
    }

    stop(): Promise<void> {
        return this.#reconcile(async () => {
            this.#onUserCommand();
            this.#intent = 'stopped';
            await audioEngine.stop();
        });
    }

    seekTo(seconds: number): Promise<void> {
        return this.#reconcile(() => {
            this.#cancelAutoSkip(); // 用户 seek = 在控制，取消待跳
            return audioEngine.seekTo(seconds);
        });
    }

    setRate(rate: number): Promise<void> {
        return this.#reconcile(() => audioEngine.setRate(rate));
    }

    /**
     * 播完当前曲即停：置位则撤走原生的 next 槽（本曲播完无处可晋升 → 自然停在曲尾）
     * 不改 JS 的 #next 账本，故撤销时直接补发即可；本曲播完后标志自动清零
     */
    setPauseAfterCurrent(enabled: boolean): Promise<void> {
        return this.#reconcile(async () => {
            const prev = this.#pauseAfterCurrent;
            if (prev === enabled) {
                return;
            }
            // 试探性赋值：#nextForNative 要据它算该不该把 next 交给原生
            this.#pauseAfterCurrent = enabled;
            try {
                await audioEngine.setNext(this.#nextForNative());
            } catch (e) {
                // 桥失败静默回滚：全程不广播，消费方不会看到「置位又撤销」这对假变更
                // （二者与「被曲终消费」同样是 true→false，无从分辨）
                this.#pauseAfterCurrent = prev;
                throw e;
            }
            // 只有确实落到原生才广播
            this.#hooks.onPauseAfterCurrentChange(enabled);
        });
    }

    /** 跳下一首：无视 Single，永远前进一格（环绕） */
    skipToNext(): Promise<void> {
        return this.#reconcile(async () => {
            this.#onUserCommand();
            await this.#skipBy(1);
        });
    }

    /** 跳上一首（环绕） */
    skipToPrevious(): Promise<void> {
        return this.#reconcile(async () => {
            this.#onUserCommand();
            await this.#skipBy(-1);
        });
    }

    /** 队列 / 模式变了：重算 next 并下发（不动 current） */
    refreshNext(): Promise<void> {
        return this.#reconcile(() => this.#refreshNext());
    }

    /**
     * 用新首选音质重解析当前曲并重建 next，保持 playing/paused 意图；供 setPreferredQuality 调用
     * 音质未变时不操作，避免丢失预取
     *
     * 位置恢复也在本事务内完成：重解析必然从 0 开始，若交给调用方随后再排一次 seek，
     * 中间插进来的切歌会让顺序变成「重解析 A → 切到 B → seek(A 的位置)」，把新歌跳到旧位置
     */
    reloadCurrentWithPreferredQuality(resumePosition = 0): Promise<void> {
        return this.#reconcile(async () => {
            const cur = this.#current;
            if (!cur || this.#intent === 'stopped') {
                return;
            }
            const quality = this.#hooks.getPreferredQuality();
            if (quality === cur.quality) {
                return;
            }
            this.#onUserCommand();
            const prevCurrent = this.#current;
            const prevNext = this.#next;
            const rebuilt = this.#makeSlot(
                cur.item,
                quality,
                cur.preferredLocalPath,
            );
            this.#current = rebuilt;
            this.#next = this.#nextSlotFor(cur.item);
            try {
                await audioEngine.setAudio(
                    rebuilt.audioItem,
                    this.#intent === 'playing',
                    this.#nextForNative(),
                );
            } catch (e) {
                // 下发失败回滚账本：否则旧槽事件因 slotId 不匹配被丢、新槽又从未生效
                this.#current = prevCurrent;
                this.#next = prevNext;
                throw e;
            }
            if (resumePosition > 0) {
                // 跳回原位置尽力而为：新音源已经下发成功，跳失败也不该把整次换档判为失败
                await audioEngine.seekTo(resumePosition).catch(() => undefined);
            }
        });
    }

    /** 清空两槽 + 停止 */
    reset(): Promise<void> {
        return this.#reconcile(async () => {
            this.#onUserCommand();
            this.#intent = 'stopped';
            this.#current = null;
            this.#next = null;
            // 清场后不会再有曲终事件，标志留着就永远消费不掉
            this.#commitPauseAfterCurrent(false);
            await audioEngine.reset();
            this.#hooks.onCurrentChange(null);
        });
    }

    /**
     * 刷新当前槽展示元数据（getMusicInfo 补充后同步封面 / 标题等到通知栏 / 锁屏）
     * 不换 slotId、不动音源、不影响播放；补充期间已切歌则按身份校验跳过
     */
    updateCurrentMeta(item: MusicItem): Promise<void> {
        return this.#reconcile(async () => {
            const cur = this.#current;
            if (!cur || !isSameMediaRef(cur.item, item)) {
                return;
            }
            // 原地更新展示字段、保 Slot 对象引用：错误恢复 / 自动跳歌按引用比较判 occurrence，替换对象会误判 stale
            // 不动 duration：时长归引擎实测（onProgress），不由 getMusicInfo 覆盖，避免双源漂移
            cur.audioItem = {
                ...cur.audioItem,
                title: item.title,
                artist: item.artist,
                album: item.album,
                artwork: item.artwork,
            };
            cur.item = item;
            await audioEngine.updateMeta(cur.audioItem);
        });
    }

    // —— 引擎事件 ——

    /** pull 回调：按 slotId 对账本取完整曲目解析音源；类型不符则重发该槽（新 slotId） */
    #resolveSource = async (
        audioItem: AudioItem,
    ): Promise<AudioSource | null> => {
        if (this.#disposed) {
            return null;
        }
        const match = this.#slotBySlotId(audioItem.slotId);
        if (!match) {
            return null; // 该 slotId 已不在任何槽 = stale（旧 load）
        }
        const outcome = await this.#resolver.resolve(
            match.slot.item,
            match.slot.quality,
            {
                allowSimilarFallback: true,
                preferredLocalPath: match.slot.preferredLocalPath,
            },
        );
        if (this.#disposed) {
            return null;
        }
        if (!outcome.ok) {
            if (outcome.reason === 'cellularBlocked') {
                if (match.which === 'current') {
                    // 流量闸拦下当前曲：停在本曲，不翻下一首
                    this.#blockCurrent(match.slot.slotId);
                } else {
                    // 次曲被拦：撤掉原生侧的暖槽（JS 账本 #next 不动）。当前曲播完后 native 无 next
                    // 可晋升，#advanceAfterEnd 的 !promoted 分支会把它当 fresh current 重新下发，
                    // 届时再走一遍闸门——比等它真晋升后靠原生补发的 E_RESOLVE 兜底更明确、不误判成可重试错误
                    await audioEngine.setNext(null);
                }
            }
            return null;
        }
        const resolved = outcome.source;
        const builtType = audioItem.streamType ?? StreamType.Progressive;
        if (resolved.streamType !== builtType) {
            // 类型不符：主动重发该槽用正确类型重建（新 slotId）；本次(旧 slotId)返 null、其错误按 slotId 自动忽略
            this.#reissueStreamType(match.which, match.slot.slotId);
            return null;
        }
        return resolved.source;
    };

    /** 一首自然播完：native 已把 next 晋升为 current，照回带的 promoted 对账 + 补新 next */
    #onAudioEnd = (ended: AudioItem, promoted: AudioItem | null): void => {
        // stale 校验移到 op 内（避免入队后又有 reset/skip 改了账本、旧 promoted 复活）
        this.#reconcile(() => this.#advanceAfterEnd(ended, promoted));
    };

    /** 某槽首次真正出声：进 reconciler（无缝晋升时 onStarted 紧跟 onAudioEnd，需等前移 op 跑完再按 slotId 判） */
    #onStarted = (item: AudioItem): void => {
        this.#reconcile(() => this.#handleStarted(item));
    };

    /** 内嵌封面：进 reconciler 按 slotId 找回完整曲目再交给 Player（迟到的旧 load 按 slotId 自然忽略） */
    #onEmbeddedArtwork = (item: AudioItem, uri: string): void => {
        this.#reconcile(() => {
            const match = this.#slotBySlotId(item.slotId);
            if (match) {
                this.#hooks.onEmbeddedArtwork(match.slot.item, uri);
            }
            return Promise.resolve();
        });
    };

    /** 播放错误：进 reconciler 再按 slotId 判槽（晋升失败时 onError 紧跟 onAudioEnd，需等前移 op 跑完，否则会把已晋升的 current 误判成 next 而不恢复） */
    #onError = (error: AudioError): void => {
        this.#reconcile(() => this.#handleError(error));
    };

    #onRemote = (action: RemoteAction): void => {
        switch (action.command) {
            case RemoteCommand.Next:
                this.skipToNext();
                break;
            case RemoteCommand.Prev:
                this.skipToPrevious();
                break;
            case RemoteCommand.Stop:
                this.stop();
                break;
            // duck：已对齐 Android（不发 duck），JS 只认 onStateChange
        }
    };

    #onStateChange = (state: PlaybackState): void => {
        this.#hooks.onStateChange(state);
        // intent 只由命令维护（play/pause/resume/stop/skip）：native 状态事件与命令异步乱序，
        // 用状态回填 intent 会被迟到 echo 覆盖（resume→stop 的迟到 Playing、pause→resume 的迟到 Paused）。
        // 远程通知操作靠 hooks.onStateChange 让 UI 感知；暂停（含远程）取消待跳
        if (state === PlaybackState.Paused) {
            this.#cancelAutoSkip();
        }
    };

    #onProgress = (progress: Progress, slotId: number): Promise<void> => {
        // 进入 reconciler：等待在途切换 op 完成（#current 已提交且 onCurrentChange 已触发），再比对已提交的
        // #current.slotId，丢弃切歌时迟到的旧 tick，以及过渡窗口中 native 已晋升但 JS 尚未处理的 next tick
        return this.#reconcile(() => {
            if (this.#current?.slotId === slotId) {
                this.#hooks.onProgress(progress);
            }
            return Promise.resolve();
        });
    };

    // —— 内部实现 ——

    /** 设当前槽 + 算 next，下发两槽（reconciler 内调用）；B3：边界预校验 + reject 回滚 */
    async #setCurrent(
        item: MusicItem,
        intent: 'playing' | 'paused',
        preferredLocalPath?: string,
    ): Promise<void> {
        if (!item.platform || !item.id) {
            // 缺可播标识：不下发原生（iOS 不 reject malformed）。是播放意图时上报，别让点击成静默死角
            if (intent === 'playing') {
                this.#hooks.onError({ code: 'invalidItem', item });
            }
            return;
        }
        const prevCurrent = this.#current;
        const prevNext = this.#next;
        const prevIntent = this.#intent;
        const current = this.#makeSlot(
            item,
            this.#hooks.getPreferredQuality(),
            preferredLocalPath,
        );
        const next = this.#nextSlotFor(item);
        this.#current = current;
        this.#next = next;
        this.#intent = intent;
        try {
            await audioEngine.setAudio(
                current.audioItem,
                intent === 'playing',
                this.#nextForNative(),
            );
        } catch {
            // 桥 reject（malformed 等）→ 回滚账本，UI / native 仍指旧曲
            this.#current = prevCurrent;
            this.#next = prevNext;
            this.#intent = prevIntent;
            return;
        }
        this.#hooks.onCurrentChange(item);
    }

    /** 自然结束后前移：照 native 回带的 promoted 对账（常态复用 #next，脱同步则重建），算新 next 下发 */
    async #advanceAfterEnd(
        ended: AudioItem,
        promoted: AudioItem | null,
    ): Promise<void> {
        if (this.#current?.slotId !== ended.slotId) {
            return; // stale：入队后 current 已被 reset/skip 改掉
        }
        if (!promoted) {
            // native 未晋升：两种成因
            // ① 主动撤了 next（播完当前曲即停）→ 把逻辑 next 载为 current 但不出声，停在下一首待播
            // ② 存在逻辑 next 却未被装载（不支持 / 未安装）→ 以 fresh current 重载续播；源仍失败由原生补发 onError(current) 兜底
            // 没有逻辑 next：队列已耗尽，停止
            const pauseAfterCurrent = this.#pauseAfterCurrent;
            this.#commitPauseAfterCurrent(false); // 一次性：无论走哪条分支都消费掉
            if (this.#next) {
                await this.#setCurrent(
                    this.#next.item,
                    pauseAfterCurrent ? 'paused' : 'playing',
                );
            } else {
                this.#current = null;
                this.#next = null;
                this.#intent = 'stopped';
                this.#hooks.onCurrentChange(null);
            }
            return;
        }
        // native 晋升的正是 JS 的 #next（slotId 匹配）→ 复用；脱同步则照 native 现实重建
        const current =
            this.#next && this.#next.slotId === promoted.slotId
                ? this.#next
                : this.#adopt(promoted);
        this.#current = current;
        this.#next = this.#nextSlotFor(current.item);
        // native 已晋升，current 是既成事实；补 next 失败只退化为曲尾重载，不能阻断 current 发布
        this.#hooks.onCurrentChange(current.item);
        await audioEngine.setNext(this.#nextForNative()).catch(() => undefined);
        // 晋升项源失败时由原生补发 onError(current)，统一交给 #recoverCurrent 恢复，不在此主动路由
    }

    /** 跳 delta 格（+1 下一首 / -1 上一首，环绕），无视 Single */
    async #skipBy(delta: number): Promise<void> {
        const cur = this.#current;
        if (!cur) {
            return;
        }
        const idx = this.#queue.indexOf(cur.item);
        if (idx < 0) {
            return;
        }
        const targetIdx =
            delta > 0
                ? this.#queue.nextIndexOf(idx)
                : this.#queue.prevIndexOf(idx);
        const target =
            targetIdx !== null ? this.#queue.at(targetIdx) : undefined;
        if (!target) {
            return;
        }
        // 目标正是已预取的 #next（非 Single 前进常见）→ 复用其 slot 保 slotId 一致 → Android 快路径无缝
        if (
            delta > 0 &&
            this.#next &&
            isSameMediaRef(this.#next.item, target)
        ) {
            await this.#advanceToPrefetched();
        } else {
            await this.#setCurrent(target, 'playing');
        }
    }

    /** 用户切到已预取的 #next：复用其 slotId 下发 setAudio（Android 快路径 seek 暖槽无缝） */
    async #advanceToPrefetched(): Promise<void> {
        const promoted = this.#next;
        if (!promoted) {
            return;
        }
        const prevCurrent = this.#current;
        const prevNext = this.#next;
        const prevIntent = this.#intent;
        this.#current = promoted;
        this.#intent = 'playing';
        this.#next = this.#nextSlotFor(promoted.item);
        try {
            await audioEngine.setAudio(
                promoted.audioItem,
                true,
                this.#nextForNative(),
            );
        } catch {
            this.#current = prevCurrent;
            this.#next = prevNext;
            this.#intent = prevIntent;
            return;
        }
        this.#hooks.onCurrentChange(promoted.item);
    }

    /** 当前曲失败恢复：按错误码最多重解析一次，否则读策略停 / 跳 */
    async #recoverCurrent(slot: Slot, code: AudioErrorCode): Promise<void> {
        if (
            this.#current !== slot ||
            this.#intent === 'stopped' ||
            this.#failedTracks.has(mediaKey(slot.item))
        ) {
            return;
        }
        const cacheKey = slot.cacheKey;
        if (code === AudioErrorCode.Unsupported) {
            // 类型不支持（如 iOS DASH）：忘记类型（否则 get 命中会回种旧类型），重建按 progressive / local
            this.#cache.forgetStreamType(cacheKey);
        }
        const retryable =
            code === AudioErrorCode.Source ||
            code === AudioErrorCode.Unsupported;
        if (retryable && !this.#retried.has(cacheKey)) {
            this.#retried.add(cacheKey);
            this.#cache.invalidate(cacheKey); // 失效源 → 重解析拿新鲜结果
            await this.#reloadCurrent(slot);
            return;
        }
        // 不可重试（E_DECODE / E_RESOLVE / E_UNKNOWN）或已重试过 → 停 / 跳
        await this.#applyErrorPolicy(slot);
    }

    /** 重发当前槽（新 slotId + 重解析；顺带拾取新学到 / 已忘记的 streamType） */
    async #reloadCurrent(slot: Slot): Promise<void> {
        if (this.#current !== slot || this.#intent === 'stopped') {
            return;
        }
        const rebuilt = this.#makeSlot(
            slot.item,
            slot.quality,
            slot.preferredLocalPath,
        );
        this.#current = rebuilt;
        await audioEngine.setAudio(
            rebuilt.audioItem,
            this.#intent === 'playing',
            this.#nextForNative(),
        );
    }

    /** 出错策略：停在本曲，或尝试本轮尚未失败的歌曲 */
    async #applyErrorPolicy(slot: Slot): Promise<void> {
        if (this.#current !== slot) {
            return;
        }
        // 本曲重试后仍失败（拉不到可用音源）→ 上报（是否提示由消费端策略决定）；下面照旧停 / 跳
        this.#hooks.onError({ code: 'sourceUnavailable', item: slot.item });
        if (this.#hooks.stopOnError()) {
            this.#intent = 'stopped';
            await audioEngine.stop();
            return;
        }
        this.#failedTracks.add(mediaKey(slot.item));
        if (!this.#autoSkipTarget(slot.item)) {
            this.#intent = 'stopped';
            await audioEngine.stop();
            return;
        }
        this.#scheduleAutoSkip(slot);
    }

    /**
     * 延迟（可取消）后内部跳下一首；等待期间用户命令 / 暂停会取消或中止
     * 等待按本轮失败歌曲数逐步延长：500 / 1000 / 2000 / 4000ms，此后保持 4000ms
     * 等待走 background timer：后台放歌时源失效也能按时跳，不必等回前台（JS setTimeout 后台被暂停）
     */
    #scheduleAutoSkip(slot: Slot): void {
        this.#cancelAutoSkip();
        const controller = new AbortController();
        this.#skipAbort = controller;
        const delayMs = Math.min(
            ERROR_SKIP_DELAY_MS * 2 ** (this.#failedTracks.size - 1),
            MAX_ERROR_SKIP_DELAY_MS,
        );
        delay(delayMs, {
            runInBackground: true,
            signal: controller.signal,
        }).then(
            () => {
                // 期间被取消并重排过则本轮作废，交给接管的那一轮
                if (this.#skipAbort !== controller) {
                    return;
                }
                this.#skipAbort = null;
                this.#reconcile(() => this.#autoSkipFrom(slot));
            },
            () => {
                // abort：用户命令 / 暂停 / seek / dispose 已接管
            },
        );
    }

    async #autoSkipFrom(slot: Slot): Promise<void> {
        if (this.#current !== slot || this.#intent !== 'playing') {
            return; // 等待期间用户已操作 / 暂停 → 不跳
        }
        const target = this.#autoSkipTarget(slot.item);
        if (!target) {
            this.#intent = 'stopped';
            await audioEngine.stop();
            return;
        }
        await this.#setCurrent(target, 'playing');
    }

    #autoSkipTarget(current: MusicItem): MusicItem | null {
        let index = this.#queue.nextIndexOf(this.#queue.indexOf(current));
        for (
            let checked = 0;
            index !== null && checked < this.#queue.size;
            checked++
        ) {
            const candidate = this.#queue.at(index);
            if (candidate && !this.#failedTracks.has(mediaKey(candidate))) {
                return candidate;
            }
            index = this.#queue.nextIndexOf(index);
        }
        return null;
    }

    /** 重算 next 并下发 */
    async #refreshNext(): Promise<void> {
        const cur = this.#current;
        if (!cur) {
            return;
        }
        this.#next = this.#nextSlotFor(cur.item);
        await audioEngine.setNext(this.#nextForNative());
    }

    /** 该下发给原生的 next：置位「播完当前曲即停」时压成 null，让本曲播完无处可晋升 */
    #nextForNative(): AudioItem | null {
        return this.#pauseAfterCurrent ? null : this.#next?.audioItem ?? null;
    }

    /**
     * 标志的提交口：落值 + 上报（仅值真变时）
     * 用于「已成既定事实」的变更（曲终消费、reset 清场）；setPauseAfterCurrent 那条
     * 因为要先试探再落地，自行管理赋值与回滚，只在成功后才广播
     *
     * 消费方（core/sleepTimer）靠这条广播知道「等待当前曲结束」何时收口——该事实取决于
     * 原生有没有晋升、走了哪条分支，只有这里算得出来，不能让外部从曲终自行反推
     */
    #commitPauseAfterCurrent(enabled: boolean): void {
        if (this.#pauseAfterCurrent === enabled) {
            return;
        }
        this.#pauseAfterCurrent = enabled;
        this.#hooks.onPauseAfterCurrentChange(enabled);
    }

    /** 算 current 的 next 并建槽（校验 platform/id，缺则 null——避免畸形 next 令 setAudio reject / 两端不一致） */
    #nextSlotFor(currentItem: MusicItem): Slot | null {
        const nextItem = this.#computeNext(currentItem);
        if (!nextItem || !nextItem.platform || !nextItem.id) {
            return null;
        }
        return this.#makeSlot(nextItem, this.#hooks.getPreferredQuality());
    }

    /** streamType 主动纠正：确认该槽还是那次 load，用正确类型重建（新 slotId） */
    #reissueStreamType(which: 'current' | 'next', slotId: number): void {
        this.#reconcile(async () => {
            if (
                which === 'current' &&
                this.#current?.slotId === slotId &&
                this.#intent !== 'stopped'
            ) {
                const rebuilt = this.#makeSlot(
                    this.#current.item,
                    this.#current.quality,
                    this.#current.preferredLocalPath,
                );
                this.#current = rebuilt;
                await audioEngine.setAudio(
                    rebuilt.audioItem,
                    this.#intent === 'playing',
                    this.#nextForNative(),
                );
            } else if (which === 'next' && this.#next?.slotId === slotId) {
                const rebuilt = this.#makeSlot(
                    this.#next.item,
                    this.#next.quality,
                );
                this.#next = rebuilt;
                // 置位「播完当前曲即停」时原生本就没有 next，重建也不下发
                await audioEngine.setNext(this.#nextForNative());
            }
        });
    }

    /**
     * 流量闸拦下当前曲：停在本曲，不翻下一首——队列里其余联网曲目同样过不去，翻下去只会一路翻到队尾
     * 入队早于返回 null（原生拿到 null 才可能报错），故本 op 必先于随后的 #recoverCurrent 跑；
     * 那边开头的 `intent === 'stopped'` 守卫会把补发的 E_RESOLVE 一并吃掉，不必另做抑制
     */
    #blockCurrent(slotId: number): void {
        this.#reconcile(async () => {
            if (
                this.#current?.slotId !== slotId ||
                this.#intent === 'stopped'
            ) {
                return;
            }
            this.#hooks.onError({
                code: 'cellularBlocked',
                item: this.#current.item,
            });
            this.#intent = 'stopped';
            this.#failedTracks.clear();
            // 显式摘掉原生侧可能残留的 next 暖槽：不依赖 #resolveSource 的 next 分支是否已跑完那次
            // setNext(null)，确保停播那一刻起原生确定性地没有 next，避免后续快路径复用绕过闸门
            await audioEngine.setNext(null);
            await audioEngine.stop();
        });
    }

    /** 算 current 之后该播哪首：Single=同曲；其余=队列下一格（环绕）；不在队列返 null */
    #computeNext(currentItem: MusicItem): MusicItem | null {
        if (this.#queue.isEmpty()) {
            return null;
        }
        const idx = this.#queue.indexOf(currentItem);
        if (idx < 0) {
            return null;
        }
        if (this.#hooks.getRepeatMode() === RepeatMode.Single) {
            return this.#queue.at(idx) ?? null;
        }
        const nextIdx = this.#queue.nextIndexOf(idx);
        return nextIdx !== null ? this.#queue.at(nextIdx) ?? null : null;
    }

    #makeSlot(
        item: MusicItem,
        quality: QualityKey,
        preferredLocalPath?: string,
    ): Slot {
        const slotId = ++this.#slotSeq;
        const cacheKey = sourceCacheKey(item, quality);
        return {
            slotId,
            cacheKey,
            audioItem: {
                platform: item.platform,
                id: item.id,
                slotId,
                cacheKey,
                streamType: this.#cache.getStreamType(cacheKey),
                title: item.title,
                artist: item.artist,
                album: item.album,
                artwork: item.artwork,
                duration: item.duration,
                // 本地歌的内嵌封面走本地插件那条 TagLib 链路，原生不必再解一份落缓存
                extractEmbeddedArtwork: !isLocalPlatform(item.platform),
            },
            item,
            quality,
            preferredLocalPath,
        };
    }

    /** 照 native 回带的瘦 AudioItem 重建槽（脱同步时用）：按 platform+id 从队列取完整 MusicItem，沿用 promoted 的 slotId */
    #adopt(promoted: AudioItem): Slot {
        const quality = this.#hooks.getPreferredQuality();
        const item = this.#queueItemOf(promoted) ?? this.#foreignItem(promoted);
        return {
            slotId: promoted.slotId ?? ++this.#slotSeq,
            cacheKey: promoted.cacheKey ?? sourceCacheKey(item, quality),
            audioItem: promoted,
            item,
            quality,
        };
    }

    /** 按 platform+id 从队列找完整 MusicItem */
    #queueItemOf(audioItem: AudioItem): MusicItem | undefined {
        return this.#queue.items.find(
            it => it.platform === audioItem.platform && it.id === audioItem.id,
        );
    }

    /** promoted 已不在队列（播放中被删）→ 用瘦信息拼一个降级 MusicItem，照 native 现实继续 */
    #foreignItem(promoted: AudioItem): MusicItem {
        return {
            platform: promoted.platform,
            id: promoted.id,
            title: promoted.title,
            artist: promoted.artist,
            album: promoted.album,
            artwork: promoted.artwork,
            duration: promoted.duration,
        } as MusicItem;
    }

    #slotBySlotId(
        slotId: number | undefined,
    ): { slot: Slot; which: 'current' | 'next' } | null {
        if (slotId === undefined) {
            return null;
        }
        if (this.#current?.slotId === slotId) {
            return { slot: this.#current, which: 'current' };
        }
        if (this.#next?.slotId === slotId) {
            return { slot: this.#next, which: 'next' };
        }
        return null;
    }

    /** 用户主动命令：取消待跳，清除失败歌曲和重试记录 */
    #onUserCommand(): void {
        this.#cancelAutoSkip();
        this.#failedTracks.clear();
        this.#retried.clear();
    }

    /** 播放错误的 op 实体：按 slotId 判槽，next 只失效源、current 进恢复 */
    async #handleError(error: AudioError): Promise<void> {
        const match = this.#slotBySlotId(error.item?.slotId);
        if (!match) {
            return; // 旧 load 的迟到错误 / 已被取代 → 按 slotId 忽略
        }
        if (match.which === 'next') {
            // 次曲预取失败：只失效其源（best-effort）。真正恢复在它成为 current 时由原生补发的 onError(current) 驱动
            // （契约：失败槽晋升为 current 必发 onError(current)——Android 上媒体项的加载错只在它成为正在播的那一项时才抛出
            // （media3 1.10.1 实测：次曲播完前一直静默），iOS 在自然播完后补发）
            this.#cache.invalidate(match.slot.cacheKey);
            return;
        }
        await this.#recoverCurrent(match.slot, error.code);
    }

    /** onStarted reconciled op：按 slotId 判「真正开播」 */
    #handleStarted(item: AudioItem): Promise<void> {
        // native onStarted 保证该 slot 已真正出声（=native 的 current）；即便 JS 账本还记它为 #next
        // （onStarted 早于 onAudioEnd 到达）也立即提交——该曲确实在响，不能拖到账本晚到而丢
        const match = this.#slotBySlotId(item.slotId);
        if (match) {
            this.#fireStarted(match.slot);
        }
        return Promise.resolve();
    }

    /** 一首真正开播：取消待跳、清除失败和重试记录，再上报播放历史 */
    #fireStarted(slot: Slot): void {
        this.#cancelAutoSkip();
        this.#failedTracks.clear();
        this.#retried.clear();
        this.#hooks.onPlaybackStarted(slot.item);
    }

    /** 取消待跳：中止等待中的自动跳歌，未在等待为 no-op */
    #cancelAutoSkip(): void {
        this.#skipAbort?.abort();
        this.#skipAbort = null;
    }

    /** 串行执行命令 / 改槽操作；op 抛错被吞（不断链、不产生未处理 rejection） */
    #reconcile(op: () => Promise<void>): Promise<void> {
        if (this.#disposed) {
            return Promise.resolve();
        }
        // 执行时再查一次：dispose 可能发生在入队之后、轮到它之前
        const guarded = (): Promise<void> =>
            this.#disposed ? Promise.resolve() : op();
        const run = this.#chain.then(guarded, guarded).catch(() => {});
        this.#chain = run;
        return run;
    }
}
