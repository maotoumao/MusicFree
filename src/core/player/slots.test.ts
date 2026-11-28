/**
 * SlotController「播完当前曲即停」单测：撤 / 补原生 next 槽、曲终落到暂停而非续播、
 * 一次性清零、Single 循环下标志优先，以及未置位时原生未晋升的续播回归
 * 原生桥 @/native/audioEngine 被 mock；resolver / cache / queue / hooks 用最小 fake
 */
jest.mock('@/native/audioEngine', () => ({
    audioEngine: {
        setup: jest.fn(async () => undefined),
        setAudio: jest.fn(async () => undefined),
        setNext: jest.fn(async () => undefined),
        play: jest.fn(async () => undefined),
        pause: jest.fn(async () => undefined),
        stop: jest.fn(async () => undefined),
        seekTo: jest.fn(async () => undefined),
        setRate: jest.fn(async () => undefined),
        setSourceResolver: jest.fn(() => () => undefined),
        onAudioEnd: jest.fn(() => () => undefined),
        onStarted: jest.fn(() => () => undefined),
        onError: jest.fn(() => () => undefined),
        onEmbeddedArtwork: jest.fn(() => () => undefined),
        onRemote: jest.fn(() => () => undefined),
        onStateChange: jest.fn(() => () => undefined),
        onProgress: jest.fn(() => () => undefined),
    },
    AudioErrorCode: {
        Source: 'E_SOURCE',
        Unsupported: 'E_UNSUPPORTED',
        Resolve: 'E_RESOLVE',
        Decode: 'E_DECODE',
        Unknown: 'E_UNKNOWN',
    },
    PlaybackState: { Idle: 'idle', Playing: 'playing', Paused: 'paused' },
    RemoteCommand: { Next: 'next', Prev: 'prev', Stop: 'stop' },
    StreamType: { Progressive: 'progressive', Hls: 'hls', Dash: 'dash' },
}));
const mockDelays: number[] = [];
const mockPendingDelays: Array<{
    resolve: () => void;
    signal?: AbortSignal;
}> = [];
jest.mock('@/infra/timer', () => ({
    delay: (ms: number, options?: { signal?: AbortSignal }) => {
        mockDelays.push(ms);
        return new Promise<void>((resolve, reject) => {
            const signal = options?.signal;
            mockPendingDelays.push({ resolve, signal });
            if (signal?.aborted) {
                reject(new Error('aborted'));
                return;
            }
            signal?.addEventListener(
                'abort',
                () => reject(new Error('aborted')),
                {
                    once: true,
                },
            );
        });
    },
}));
// slots → sourceCache → infra/storage → MMKV / react-native-fs 全是原生依赖；
// slots 只用到其中一个纯函数，mock 这一层即可切断整条链
jest.mock('./sourceCache', () => ({
    sourceCacheKey: (item: { platform: string; id: string }, quality: string) =>
        `${item.platform}:${item.id}:${quality}`,
}));

import { audioEngine, StreamType } from '@/native/audioEngine';
import { LOCAL_MEDIA_PLATFORM } from '@/utils/media';

import { PlayQueue } from './queue';
import { SlotController } from './slots';
import { RepeatMode } from './types';

import type { SlotHooks } from './slots';
import type { SourceResolver } from './sourceResolver';
import type { AudioItem } from '@/native/audioEngine';
import type { MusicItem } from '@/types';

const engine = audioEngine as jest.Mocked<typeof audioEngine>;

const track = (id: string): MusicItem =>
    ({ platform: 'demo', id, title: `曲 ${id}` } as MusicItem);

const A = track('a');
const B = track('b');

function makeQueue(items: MusicItem[] = [A, B]): PlayQueue {
    const queue = new PlayQueue();
    queue.replace(items);
    return queue;
}

function makeController(
    repeatMode = RepeatMode.Queue,
    resolver: Partial<SourceResolver> = {},
    queue = makeQueue(),
) {
    const hooks: SlotHooks = {
        getRepeatMode: () => repeatMode,
        getPreferredQuality: () => 'standard',
        stopOnError: () => false,
        onCurrentChange: jest.fn(),
        onPlaybackStarted: jest.fn(),
        onEmbeddedArtwork: jest.fn(),
        onStateChange: jest.fn(),
        onProgress: jest.fn(),
        onPauseAfterCurrentChange: jest.fn(),
        onError: jest.fn(),
    };
    const controller = new SlotController({
        resolver: resolver as SourceResolver,
        cache: {
            getStreamType: () => undefined,
            invalidate: jest.fn(),
        } as never,
        queue,
        hooks,
    });
    return { controller, hooks };
}

/** setup 时注册的曲终回调（用它模拟原生「本曲播完」） */
function capturedAudioEnd(): (
    ended: AudioItem,
    promoted: AudioItem | null,
) => void {
    const call = engine.onAudioEnd.mock.calls.at(-1);
    if (!call) {
        throw new Error('onAudioEnd 未注册');
    }
    return call[0];
}

/** 最近一次下发给原生的 current AudioItem 与 autoPlay */
function lastSetAudio() {
    const call = engine.setAudio.mock.calls.at(-1);
    if (!call) {
        throw new Error('setAudio 未调用');
    }
    return { item: call[0], autoPlay: call[1], next: call[2] };
}

/** setup 时注册的 pull 回调（原生来要音源） */
function capturedResolveSource(): (item: AudioItem) => Promise<unknown | null> {
    const call = engine.setSourceResolver.mock.calls.at(-1);
    if (!call) {
        throw new Error('setSourceResolver 未注册');
    }
    return call[0];
}

/** setup 时注册的内嵌封面回调 */
function capturedEmbeddedArtwork(): (item: AudioItem, uri: string) => void {
    const call = engine.onEmbeddedArtwork.mock.calls.at(-1);
    if (!call) {
        throw new Error('onEmbeddedArtwork 未注册');
    }
    return call[0];
}

/** setup 时注册的错误回调（用它模拟原生上报播放错误） */
function capturedError(): (error: { code: string; item: AudioItem }) => void {
    const call = engine.onError.mock.calls.at(-1);
    if (!call) {
        throw new Error('onError 未注册');
    }
    return call[0] as (error: { code: string; item: AudioItem }) => void;
}

function capturedStarted(): (item: AudioItem) => void {
    const call = engine.onStarted.mock.calls.at(-1);
    if (!call) {
        throw new Error('onStarted 未注册');
    }
    return call[0];
}

/** setup 时注册的进度回调；返回 Promise 表示该样本已穿过 reconciler 完成消费 */
function capturedProgress(): (
    progress: { position: number; duration: number; buffered: number },
    slotId: number,
) => void | Promise<void> {
    const call = engine.onProgress.mock.calls.at(-1);
    if (!call) {
        throw new Error('onProgress 未注册');
    }
    return call[0];
}

/** 让 controller 的 reconciler 排空（op 是内部入队的，没有句柄可 await） */
const flush = (): Promise<void> => new Promise(r => setImmediate(r));

async function finishAutoSkip(): Promise<void> {
    const pending = mockPendingDelays.shift();
    if (!pending) {
        throw new Error('没有待完成的自动跳歌');
    }
    pending.resolve();
    await flush();
}

beforeEach(() => {
    jest.clearAllMocks();
    mockDelays.length = 0;
    mockPendingDelays.length = 0;
});

describe('SlotController · 连续失败的节奏', () => {
    it('前五首失败仍尝试第六首，等待时间最多四秒', async () => {
        const items = [A, B, track('c'), track('d'), track('e'), track('f')];
        const { controller, hooks } = makeController(
            RepeatMode.Queue,
            {},
            makeQueue(items),
        );
        await controller.setup();
        await controller.play(A);
        engine.stop.mockClear();

        for (const item of items.slice(0, 5)) {
            expect(lastSetAudio().item.id).toBe(item.id);
            capturedError()({ code: 'E_RESOLVE', item: lastSetAudio().item });
            await flush();
            await finishAutoSkip();
        }
        expect(lastSetAudio().item.id).toBe('f');
        expect(mockDelays).toEqual([500, 1000, 2000, 4000, 4000]);
        capturedStarted()(lastSetAudio().item);
        await flush();
        expect(hooks.onPlaybackStarted).toHaveBeenCalledWith(items[5]);
        expect(engine.stop).not.toHaveBeenCalled();
    });

    it('两首歌曲都最终失败后停止，不重复尝试第一首', async () => {
        const { controller, hooks } = makeController();
        await controller.setup();
        await controller.play(A);
        capturedError()({ code: 'E_RESOLVE', item: lastSetAudio().item });
        await flush();
        await finishAutoSkip();
        expect(lastSetAudio().item.id).toBe(B.id);

        capturedError()({ code: 'E_RESOLVE', item: lastSetAudio().item });
        await flush();
        expect(engine.stop).toHaveBeenCalledTimes(1);
        expect(mockDelays).toEqual([500]);
        expect(engine.setAudio).toHaveBeenCalledTimes(2);
        expect(hooks.onError).toHaveBeenCalledTimes(2);
    });

    it.each([RepeatMode.Queue, RepeatMode.Shuffle, RepeatMode.Single])(
        '%s 从队列中间开始，绕回队首尝试剩余歌曲后才停止',
        async mode => {
            const queue = makeQueue([A, B, track('c'), track('d')]);
            if (mode === RepeatMode.Shuffle) {
                const random = jest.spyOn(Math, 'random').mockReturnValue(0);
                queue.shuffle();
                random.mockRestore();
            }
            const order = [...queue.items.slice(2), ...queue.items.slice(0, 2)];
            const { controller } = makeController(mode, {}, queue);
            await controller.setup();
            await controller.play(order[0]!);

            for (const [index, item] of order.entries()) {
                expect(lastSetAudio().item.id).toBe(item.id);
                capturedError()({
                    code: 'E_RESOLVE',
                    item: lastSetAudio().item,
                });
                await flush();
                if (index < order.length - 1) {
                    expect(engine.stop).not.toHaveBeenCalled();
                    await finishAutoSkip();
                }
            }
            expect(engine.setAudio.mock.calls.map(call => call[0].id)).toEqual(
                order.map(item => item.id),
            );
            expect(engine.stop).toHaveBeenCalledTimes(1);
        },
    );

    it('同一曲重复报错不重复记账、不重排等待，也不重新加载', async () => {
        const { controller, hooks } = makeController();
        await controller.setup();
        await controller.play(A);
        const current = lastSetAudio().item;
        for (const code of ['E_RESOLVE', 'E_RESOLVE', 'E_SOURCE', 'E_DECODE']) {
            capturedError()({ code, item: current });
            await flush();
        }
        expect(mockDelays).toEqual([500]);
        expect(mockPendingDelays[0]?.signal?.aborted).toBe(false);
        expect(engine.setAudio).toHaveBeenCalledTimes(1);
        expect(hooks.onError).toHaveBeenCalledTimes(1);
        await finishAutoSkip();
        expect(lastSetAudio().item.id).toBe(B.id);
    });

    it('只记录最终失败，保留当前曲原有的一次音源重试', async () => {
        const { controller, hooks } = makeController();
        await controller.setup();
        await controller.play(A);
        const old = lastSetAudio().item;
        capturedError()({ code: 'E_SOURCE', item: old });
        await flush();
        expect(lastSetAudio().item.slotId).not.toBe(old.slotId);
        expect(hooks.onError).not.toHaveBeenCalled();
        expect(mockDelays).toEqual([]);

        capturedError()({ code: 'E_RESOLVE', item: old });
        await flush();
        expect(hooks.onError).not.toHaveBeenCalled();
        capturedError()({ code: 'E_SOURCE', item: lastSetAudio().item });
        await flush();
        expect(hooks.onError).toHaveBeenCalledTimes(1);
        expect(mockDelays).toEqual([500]);
        await finishAutoSkip();
        expect(lastSetAudio().item.id).toBe(B.id);
    });

    it('下一首预加载失败不提前计入整队失败', async () => {
        const { controller, hooks } = makeController();
        await controller.setup();
        await controller.play(A);
        capturedError()({ code: 'E_RESOLVE', item: lastSetAudio().next! });
        await flush();
        expect(hooks.onError).not.toHaveBeenCalled();
        capturedError()({ code: 'E_RESOLVE', item: lastSetAudio().item });
        await flush();
        await finishAutoSkip();
        expect(lastSetAudio().item.id).toBe(B.id);
        expect(engine.stop).not.toHaveBeenCalled();
    });

    it('成功出声后清空失败记录和等待档位，之前失败的歌可重新尝试', async () => {
        const { controller } = makeController();
        await controller.setup();
        await controller.play(A);
        capturedError()({ code: 'E_RESOLVE', item: lastSetAudio().item });
        await flush();
        await finishAutoSkip();
        capturedStarted()(lastSetAudio().item);
        await flush();
        capturedError()({ code: 'E_RESOLVE', item: lastSetAudio().item });
        await flush();
        expect(mockDelays).toEqual([500, 500]);
        await finishAutoSkip();
        expect(lastSetAudio().item.id).toBe(A.id);
        expect(engine.stop).not.toHaveBeenCalled();
    });

    it('等待期间当前曲成功出声，取消已经排好的跳歌', async () => {
        const { controller } = makeController();
        await controller.setup();
        await controller.play(A);
        capturedError()({ code: 'E_RESOLVE', item: lastSetAudio().item });
        await flush();
        capturedStarted()(lastSetAudio().item);
        await flush();
        expect(mockPendingDelays[0]?.signal?.aborted).toBe(true);
        await finishAutoSkip();
        expect(engine.setAudio).toHaveBeenCalledTimes(1);
        expect(engine.stop).not.toHaveBeenCalled();
    });

    it('开启失败停止设置时，当前曲重试后失败就停止', async () => {
        const { controller, hooks } = makeController();
        hooks.stopOnError = () => true;
        await controller.setup();
        await controller.play(A);
        capturedError()({ code: 'E_SOURCE', item: lastSetAudio().item });
        await flush();
        expect(engine.stop).not.toHaveBeenCalled();
        capturedError()({ code: 'E_SOURCE', item: lastSetAudio().item });
        await flush();
        expect(engine.stop).toHaveBeenCalledTimes(1);
        expect(mockDelays).toEqual([]);
        expect(lastSetAudio().item.id).toBe(A.id);
    });

    it.each(['pause', 'stop', 'seek', 'next', 'dispose'])(
        '等待期间用户操作 %s，不再执行旧跳歌',
        async action => {
            const { controller } = makeController();
            await controller.setup();
            await controller.play(A);
            capturedError()({ code: 'E_RESOLVE', item: lastSetAudio().item });
            await flush();
            const actions: Record<string, () => void | Promise<void>> = {
                pause: () => controller.pause(),
                stop: () => controller.stop(),
                seek: () => controller.seekTo(10),
                next: () => controller.skipToNext(),
                dispose: () => controller.dispose(),
            };
            await actions[action]!();
            expect(mockPendingDelays[0]?.signal?.aborted).toBe(true);
            const calls = engine.setAudio.mock.calls.length;
            await finishAutoSkip();
            expect(engine.setAudio).toHaveBeenCalledTimes(calls);
        },
    );

    it.each(['play', 'resume', 'quality'])(
        '主动操作 %s 后重新尝试已失败的歌曲',
        async action => {
            const { controller, hooks } = makeController();
            await controller.setup();
            await controller.play(A);
            capturedError()({ code: 'E_RESOLVE', item: lastSetAudio().item });
            await flush();
            await finishAutoSkip();
            capturedError()({ code: 'E_RESOLVE', item: lastSetAudio().item });
            await flush();
            expect(engine.stop).toHaveBeenCalledTimes(1);

            if (action === 'play') {
                await controller.play(B);
            } else if (action === 'resume') {
                await controller.resume();
            } else {
                await controller.resume();
                capturedError()({
                    code: 'E_RESOLVE',
                    item: lastSetAudio().item,
                });
                await flush();
                hooks.getPreferredQuality = () => 'high';
                await controller.reloadCurrentWithPreferredQuality();
                await finishAutoSkip();
            }
            capturedError()({ code: 'E_RESOLVE', item: lastSetAudio().item });
            await flush();
            expect(mockDelays.at(-1)).toBe(500);
            await finishAutoSkip();
            expect(lastSetAudio().item.id).toBe(A.id);
            expect(engine.stop).toHaveBeenCalledTimes(1);
        },
    );

    it('等待期间新加入的歌曲仍会被尝试', async () => {
        const queue = makeQueue();
        const { controller } = makeController(RepeatMode.Queue, {}, queue);
        await controller.setup();
        await controller.play(A);
        capturedError()({ code: 'E_RESOLVE', item: lastSetAudio().item });
        await flush();
        queue.append([track('c')]);
        await controller.refreshNext();
        await finishAutoSkip();
        capturedError()({ code: 'E_RESOLVE', item: lastSetAudio().item });
        await flush();
        expect(engine.stop).not.toHaveBeenCalled();
        await finishAutoSkip();
        expect(lastSetAudio().item.id).toBe('c');
        capturedError()({ code: 'E_RESOLVE', item: lastSetAudio().item });
        await flush();
        expect(engine.stop).toHaveBeenCalledTimes(1);
    });

    it('删除已失败歌曲后，不把失败集合大小当作剩余队列的覆盖数', async () => {
        const queue = makeQueue([A, B, track('c')]);
        const { controller } = makeController(RepeatMode.Queue, {}, queue);
        await controller.setup();
        await controller.play(A);
        capturedError()({ code: 'E_RESOLVE', item: lastSetAudio().item });
        await flush();
        await finishAutoSkip();
        queue.remove(A);
        await controller.refreshNext();
        capturedError()({ code: 'E_RESOLVE', item: lastSetAudio().item });
        await flush();
        expect(engine.stop).not.toHaveBeenCalled();
        await finishAutoSkip();
        expect(lastSetAudio().item.id).toBe('c');
    });

    it('等待期间删除最后一首未失败歌曲，到期后停止而不重复播放', async () => {
        const queue = makeQueue();
        const { controller } = makeController(RepeatMode.Queue, {}, queue);
        await controller.setup();
        await controller.play(A);
        capturedError()({ code: 'E_RESOLVE', item: lastSetAudio().item });
        await flush();
        queue.remove(B);
        await controller.refreshNext();
        await finishAutoSkip();
        expect(engine.stop).toHaveBeenCalledTimes(1);
        expect(engine.setAudio).toHaveBeenCalledTimes(1);
    });

    it('重新排序后跳过已失败歌曲，继续找尚未尝试的歌曲', async () => {
        const queue = makeQueue([A, B, track('c')]);
        const { controller } = makeController(RepeatMode.Queue, {}, queue);
        await controller.setup();
        await controller.play(A);
        capturedError()({ code: 'E_RESOLVE', item: lastSetAudio().item });
        await flush();
        await finishAutoSkip();
        capturedError()({ code: 'E_RESOLVE', item: lastSetAudio().item });
        await flush();
        queue.insertAfter(B, [A]);
        await controller.refreshNext();
        await finishAutoSkip();
        expect(lastSetAudio().item.id).toBe('c');
        capturedError()({ code: 'E_RESOLVE', item: lastSetAudio().item });
        await flush();
        expect(engine.stop).toHaveBeenCalledTimes(1);
        expect(engine.setAudio.mock.calls.map(call => call[0].id)).toEqual([
            'a',
            'b',
            'c',
        ]);
    });

    it('切入再退出随机模式只改变顺序，不清空失败记录', async () => {
        const queue = makeQueue([A, B, track('c')]);
        const { controller, hooks } = makeController(
            RepeatMode.Queue,
            {},
            queue,
        );
        await controller.setup();
        await controller.play(A);
        capturedError()({ code: 'E_RESOLVE', item: lastSetAudio().item });
        await flush();
        const random = jest.spyOn(Math, 'random').mockReturnValue(0);
        queue.shuffle();
        random.mockRestore();
        hooks.getRepeatMode = () => RepeatMode.Shuffle;
        await controller.refreshNext();
        await finishAutoSkip();
        expect(lastSetAudio().item.id).toBe(B.id);
        capturedError()({ code: 'E_RESOLVE', item: lastSetAudio().item });
        await flush();
        queue.restoreOrder();
        hooks.getRepeatMode = () => RepeatMode.Queue;
        await controller.refreshNext();
        await finishAutoSkip();
        expect(lastSetAudio().item.id).toBe('c');
        capturedError()({ code: 'E_RESOLVE', item: lastSetAudio().item });
        await flush();
        expect(engine.stop).toHaveBeenCalledTimes(1);
    });

    it('不同音源的同名 id 分别尝试，不合并失败记录', async () => {
        const other = { ...A, platform: 'demo2' };
        const { controller } = makeController(
            RepeatMode.Queue,
            {},
            makeQueue([A, other]),
        );
        await controller.setup();
        await controller.play(A);
        capturedError()({ code: 'E_RESOLVE', item: lastSetAudio().item });
        await flush();
        await finishAutoSkip();
        expect(lastSetAudio().item.platform).toBe('demo2');
        capturedError()({ code: 'E_RESOLVE', item: lastSetAudio().item });
        await flush();
        expect(engine.stop).toHaveBeenCalledTimes(1);
    });

    it('队列只有一首且最终失败时立即停止', async () => {
        const { controller } = makeController(
            RepeatMode.Single,
            {},
            makeQueue([A]),
        );
        await controller.setup();
        await controller.play(A);
        capturedError()({ code: 'E_RESOLVE', item: lastSetAudio().item });
        await flush();
        expect(engine.stop).toHaveBeenCalledTimes(1);
        expect(mockDelays).toEqual([]);
    });
});

describe('SlotController · 流量闸拦下', () => {
    const blocked = {
        resolve: async () => ({ ok: false, reason: 'cellularBlocked' }),
    } as unknown as Partial<SourceResolver>;

    it('当前曲被拦：停在本曲、不翻下一首', async () => {
        const { controller, hooks } = makeController(RepeatMode.Queue, blocked);
        await controller.setup();
        await controller.play(A);
        const current = lastSetAudio().item;
        engine.setAudio.mockClear();

        await capturedResolveSource()(current);
        await flush();

        expect(hooks.onError).toHaveBeenCalledWith({
            code: 'cellularBlocked',
            item: A,
        });
        expect(engine.stop).toHaveBeenCalled();
        // 关键：没有翻到 B —— 队列里其余联网曲目同样过不去
        expect(engine.setAudio).not.toHaveBeenCalled();
    });

    it('原生随后补发的解析错误被既有 stopped 守卫吃掉，不重复上报', async () => {
        const { controller, hooks } = makeController(RepeatMode.Queue, blocked);
        await controller.setup();
        await controller.play(A);
        const current = lastSetAudio().item;

        await capturedResolveSource()(current);
        await flush();
        capturedError()({ code: 'E_RESOLVE', item: current });
        await flush();

        // 只有被拦那一次；不会再冒一个 sourceUnavailable（次数与原因都要对，
        // 只断言次数的话「没拦住、只报了 sourceUnavailable」同样是 1 次，会假绿）
        expect(hooks.onError).toHaveBeenCalledTimes(1);
        expect(hooks.onError).toHaveBeenCalledWith({
            code: 'cellularBlocked',
            item: A,
        });
    });

    it('预取的下一首被拦：不上报、不停播', async () => {
        const { controller, hooks } = makeController(RepeatMode.Queue, blocked);
        await controller.setup();
        await controller.play(A);
        const next = lastSetAudio().next as AudioItem;
        engine.stop.mockClear();

        await capturedResolveSource()(next);
        await flush();

        expect(hooks.onError).not.toHaveBeenCalled();
        expect(engine.stop).not.toHaveBeenCalled();
    });

    it('源不可用仍走原有策略，不被流量闸分支截走', async () => {
        const unavailable = {
            resolve: async () => ({ ok: false, reason: 'unavailable' }),
        } as unknown as Partial<SourceResolver>;
        const { controller, hooks } = makeController(
            RepeatMode.Queue,
            unavailable,
        );
        await controller.setup();
        await controller.play(A);
        const current = lastSetAudio().item;

        await capturedResolveSource()(current);
        await flush();

        // 解析返空本身不上报（等原生报错走既有恢复链），更不该报成 cellularBlocked
        expect(hooks.onError).not.toHaveBeenCalled();
        expect(engine.stop).not.toHaveBeenCalled();
    });
});

describe('SlotController · 本次首选文件', () => {
    it.each([
        { name: '单曲循环', mode: RepeatMode.Single, items: [A, B] },
        { name: '单首列表循环', mode: RepeatMode.Queue, items: [A] },
    ])(
        '$name的后续 occurrence 独立解析同一身份，不继承临时路径',
        async ({ mode, items }) => {
            const resolve = jest.fn(async (item: MusicItem) => ({
                ok: true as const,
                source: {
                    source: { url: `file:///scanned/${item.id}.mp3` },
                    streamType: StreamType.Progressive,
                    quality: 'standard' as const,
                },
            }));
            const { controller } = makeController(
                mode,
                { resolve },
                makeQueue(items),
            );
            await controller.setup();
            await controller.play(A, {
                preferredLocalPath: '/chosen/a.flac',
            });
            const { item: current, next } = lastSetAudio();
            if (!next) {
                throw new Error('missing next occurrence');
            }

            await capturedResolveSource()(current);
            expect(await capturedResolveSource()(next)).toEqual({
                url: 'file:///scanned/a.mp3',
            });
            expect(next.slotId).not.toBe(current.slotId);
            expect(resolve).toHaveBeenNthCalledWith(2, A, 'standard', {
                allowSimilarFallback: true,
                preferredLocalPath: undefined,
            });

            capturedAudioEnd()(current, next);
            await controller.setRate(1);
            const subsequent = engine.setNext.mock.calls.at(-1)?.[0];
            if (!subsequent) {
                throw new Error('missing subsequent occurrence');
            }
            expect(await capturedResolveSource()(subsequent)).toEqual({
                url: 'file:///scanned/a.mp3',
            });
            expect(resolve).toHaveBeenLastCalledWith(A, 'standard', {
                allowSimilarFallback: true,
                preferredLocalPath: undefined,
            });
        },
    );

    it('只把路径交给当前 occurrence，预取的下一首不继承', async () => {
        const resolve = jest.fn(async () => ({
            ok: true as const,
            source: {
                source: { url: 'file:///music/a.flac' },
                streamType: 'progressive' as never,
                quality: 'standard' as const,
            },
        }));
        const { controller } = makeController(RepeatMode.Queue, { resolve });
        await controller.setup();
        await controller.play(A, {
            preferredLocalPath: '/music/a.flac',
        });
        const { item: current, next } = lastSetAudio();

        await capturedResolveSource()(current);
        await capturedResolveSource()(next as AudioItem);

        expect(resolve).toHaveBeenNthCalledWith(1, A, 'standard', {
            allowSimilarFallback: true,
            preferredLocalPath: '/music/a.flac',
        });
        expect(resolve).toHaveBeenNthCalledWith(2, B, 'standard', {
            allowSimilarFallback: true,
            preferredLocalPath: undefined,
        });
    });

    it('当前 occurrence 重试重建后仍保留路径', async () => {
        const resolve = jest.fn(async () => ({
            ok: true as const,
            source: {
                source: { url: 'file:///music/a.flac' },
                streamType: 'progressive' as never,
                quality: 'standard' as const,
            },
        }));
        const { controller } = makeController(RepeatMode.Queue, { resolve });
        await controller.setup();
        await controller.play(A, {
            preferredLocalPath: '/music/a.flac',
        });
        const first = lastSetAudio().item;

        capturedError()({ code: 'E_SOURCE', item: first });
        await flush();
        const retried = lastSetAudio().item;
        await capturedResolveSource()(retried);

        expect(resolve).toHaveBeenCalledWith(A, 'standard', {
            allowSimilarFallback: true,
            preferredLocalPath: '/music/a.flac',
        });
    });

    it('重新点播但未指定路径时开启新 occurrence 并清除旧值', async () => {
        const resolve = jest.fn(async () => ({
            ok: true as const,
            source: {
                source: { url: 'https://example.invalid/a.mp3' },
                streamType: 'progressive' as never,
                quality: 'standard' as const,
            },
        }));
        const { controller } = makeController(RepeatMode.Queue, { resolve });
        await controller.setup();
        await controller.play(A, {
            preferredLocalPath: '/music/a.flac',
        });

        await controller.play(A);
        await capturedResolveSource()(lastSetAudio().item);

        expect(resolve).toHaveBeenCalledWith(A, 'standard', {
            allowSimilarFallback: true,
            preferredLocalPath: undefined,
        });
    });
});

describe('SlotController · 自然晋升', () => {
    it('补 next 未结算或失败都不阻断 current 发布，随后仍可从逻辑 next 续播', async () => {
        const { controller, hooks } = makeController();
        const onCurrentChange = hooks.onCurrentChange as jest.Mock;
        await controller.setup();
        await controller.play(A);
        const ended = lastSetAudio().item;
        const promoted = lastSetAudio().next as AudioItem;
        onCurrentChange.mockClear();

        let rejectNext = (_error: Error) => undefined as void;
        engine.setNext.mockImplementationOnce(
            () =>
                new Promise<void>((_resolve, reject) => {
                    rejectNext = reject;
                }),
        );
        capturedAudioEnd()(ended, promoted);
        await flush();

        expect(onCurrentChange).toHaveBeenCalledWith(B);

        rejectNext(new Error('bridge down'));
        await controller.setRate(1);

        // 原生没装上逻辑 next，B 曲终时会回带 promoted=null；现有降级路径重新加载 A
        capturedAudioEnd()(promoted, null);
        await controller.setRate(1);
        expect(lastSetAudio().item).toMatchObject({ id: 'a' });
        expect(onCurrentChange).toHaveBeenLastCalledWith(A);
    });
});

describe('SlotController · 晋升失败的时序', () => {
    it('onError 紧跟 onAudioEnd 到达：按前移后的账本判为 current 并进入恢复，不被当成 next 吞掉', async () => {
        const { controller, hooks } = makeController();
        await controller.setup();
        await controller.play(A);
        const ended = lastSetAudio().item;
        const promoted = lastSetAudio().next as AudioItem;

        // 原生在同一帧里先报晋升、再报晋升项的解析错（Android：次曲 prepare 错延迟到它成为 playing period 才抛）
        capturedAudioEnd()(ended, promoted);
        capturedError()({ code: 'E_RESOLVE', item: promoted });
        await flush();

        // 若 onError 同步判槽，此时账本还没前移，promoted 会被判成 next → 只失效缓存、不恢复，B 就卡死在错误态
        expect(hooks.onError).toHaveBeenCalledWith({
            code: 'sourceUnavailable',
            item: B,
        });
    });

    it('可重试码走同一时序：失效缓存并用新 slotId 重发晋升项，用户才听得到声音', async () => {
        const { controller, hooks } = makeController();
        await controller.setup();
        await controller.play(A);
        const ended = lastSetAudio().item;
        const promoted = lastSetAudio().next as AudioItem;
        engine.setAudio.mockClear();

        capturedAudioEnd()(ended, promoted);
        capturedError()({ code: 'E_SOURCE', item: promoted });
        await flush();

        const reloaded = lastSetAudio();
        expect(reloaded.item).toMatchObject({ id: 'b' });
        expect(reloaded.item.slotId).not.toBe(promoted.slotId);
        expect(reloaded.autoPlay).toBe(true);
        expect(hooks.onError).not.toHaveBeenCalled();
    });
});

describe('SlotController · 内嵌封面', () => {
    it('按 slotId 找回完整曲目交给 Player；对不上账本的迟到事件忽略', async () => {
        const { controller, hooks } = makeController();
        await controller.setup();
        await controller.play(A);
        const current = lastSetAudio().item;

        capturedEmbeddedArtwork()(
            current,
            'file:///cache/embeddedArtwork/a.jpg',
        );
        await flush();
        expect(hooks.onEmbeddedArtwork).toHaveBeenCalledWith(
            A,
            'file:///cache/embeddedArtwork/a.jpg',
        );

        capturedEmbeddedArtwork()(
            { ...current, slotId: 9999 },
            'file:///cache/embeddedArtwork/stale.jpg',
        );
        await flush();
        expect(hooks.onEmbeddedArtwork).toHaveBeenCalledTimes(1);
    });
});

describe('SlotController · 内嵌封面提取开关', () => {
    it('下发原生的 AudioItem：联网曲目 true，本地歌 false（封面另有 TagLib 链路）', async () => {
        const { controller } = makeController();
        await controller.setup();
        await controller.play(A);
        expect(lastSetAudio().item.extractEmbeddedArtwork).toBe(true);

        await controller.play({
            ...A,
            platform: LOCAL_MEDIA_PLATFORM,
        } as MusicItem);
        expect(lastSetAudio().item.extractEmbeddedArtwork).toBe(false);
    });
});

describe('SlotController · 进度消费完成时机', () => {
    const progress = { position: 12, duration: 180, buffered: 24 };

    it('当前 slot 的样本发布完成后才结算', async () => {
        const { controller, hooks } = makeController();
        await controller.setup();
        await controller.play(A);
        const current = lastSetAudio().item;

        await capturedProgress()(progress, current.slotId!);

        expect(hooks.onProgress).toHaveBeenCalledWith(progress);
    });

    it('旧 slot 的样本不发布但仍正常结算', async () => {
        const { controller, hooks } = makeController();
        await controller.setup();
        await controller.play(A);

        await capturedProgress()(progress, 999_999);

        expect(hooks.onProgress).not.toHaveBeenCalled();
    });
});

describe('SlotController · 播完当前曲即停', () => {
    it('置位后撤走原生 next 槽（本曲播完无处可晋升）', async () => {
        const { controller } = makeController();
        await controller.setup();
        await controller.play(A);
        expect(lastSetAudio().next).not.toBeNull(); // 常态下 B 已预取

        await controller.setPauseAfterCurrent(true);
        expect(engine.setNext).toHaveBeenLastCalledWith(null);
    });

    it('撤销后把逻辑 next 补发回原生（无需重算队列）', async () => {
        const { controller } = makeController();
        await controller.setup();
        await controller.play(A);
        await controller.setPauseAfterCurrent(true);

        await controller.setPauseAfterCurrent(false);
        const pushed = engine.setNext.mock.calls.at(-1)?.[0];
        expect(pushed).toMatchObject({ id: 'b' });
    });

    it('重复置同值不重复下发', async () => {
        const { controller } = makeController();
        await controller.setup();
        await controller.play(A);
        await controller.setPauseAfterCurrent(true);
        const calls = engine.setNext.mock.calls.length;

        await controller.setPauseAfterCurrent(true);
        expect(engine.setNext.mock.calls.length).toBe(calls);
    });

    it('曲终暂停在下一首（不出声），标志一次性清零', async () => {
        const { controller, hooks } = makeController();
        await controller.setup();
        await controller.play(A);
        await controller.setPauseAfterCurrent(true);
        const endedItem = lastSetAudio().item;

        // 原生：本曲播完、因无 next 槽故未晋升
        capturedAudioEnd()(endedItem, null);
        await controller.setRate(1); // 借 reconciler 排空队列

        const after = lastSetAudio();
        expect(after.item).toMatchObject({ id: 'b' });
        expect(after.autoPlay).toBe(false); // 载入但不出声
        expect(hooks.onCurrentChange).toHaveBeenLastCalledWith(
            expect.objectContaining({ id: 'b' }),
        );
    });

    it('置位期间主动换曲：新 current 同样不带 next（否则要晚一首才停）', async () => {
        const { controller } = makeController();
        await controller.setup();
        await controller.play(A);
        await controller.setPauseAfterCurrent(true);

        await controller.play(B); // 用户主动切歌
        expect(lastSetAudio().next).toBeNull();

        // 新 current 自然结束 → 仍暂停在其逻辑 next
        capturedAudioEnd()(lastSetAudio().item, null);
        await controller.setRate(1);
        const after = lastSetAudio();
        expect(after.item).toMatchObject({ id: 'a' });
        expect(after.autoPlay).toBe(false);
    });

    it('曲终后标志真正清零：第二次曲终不再拦截', async () => {
        const { controller } = makeController();
        await controller.setup();
        await controller.play(A);
        await controller.setPauseAfterCurrent(true);

        capturedAudioEnd()(lastSetAudio().item, null);
        await controller.setRate(1);
        expect(lastSetAudio().autoPlay).toBe(false); // 第一次：暂停

        // 第二次曲终（标志已消费）→ 走原有续播路径
        capturedAudioEnd()(lastSetAudio().item, null);
        await controller.setRate(1);
        expect(lastSetAudio().autoPlay).toBe(true);
    });

    it('桥调用失败时回滚标志，允许重试', async () => {
        const { controller } = makeController();
        await controller.setup();
        await controller.play(A);
        engine.setNext.mockRejectedValueOnce(new Error('bridge down'));

        await controller.setPauseAfterCurrent(true); // reconciler 吞掉异常
        engine.setNext.mockClear();

        // 标志已回滚 → 同值不会被短路，重试真正下发 null
        await controller.setPauseAfterCurrent(true);
        expect(engine.setNext).toHaveBeenLastCalledWith(null);
    });

    it('撤 next 没赶上（原生仍晋升）时优雅降级：晚一首停，不会失效', async () => {
        const { controller } = makeController();
        await controller.setup();
        await controller.play(A);
        await controller.setPauseAfterCurrent(true);
        engine.setNext.mockClear();

        // 竞态：setNext(null) 未在曲尾前落到原生，A 播完后 B 被晋升并出声
        const promotedB = {
            platform: 'demo',
            id: 'b',
            slotId: 999,
            cacheKey: 'demo:b:standard',
        } as unknown as AudioItem;
        capturedAudioEnd()(lastSetAudio().item, promotedB);
        await controller.setRate(1);

        // 标志在 promoted 分支未被消费 → 立刻把 B 的 next 也压成 null
        expect(engine.setNext).toHaveBeenLastCalledWith(null);

        // B 播完时已无处可晋升 → 落到暂停，整体只是晚一首
        capturedAudioEnd()(promotedB, null);
        await controller.setRate(1);
        expect(lastSetAudio().autoPlay).toBe(false);
    });

    it('标志变化对外广播：置位、被曲终消费各发一次，同值不重发', async () => {
        const { controller, hooks } = makeController();
        const onChange = hooks.onPauseAfterCurrentChange as jest.Mock;
        await controller.setup();
        await controller.play(A);
        onChange.mockClear();

        await controller.setPauseAfterCurrent(true);
        expect(onChange.mock.calls).toEqual([[true]]);

        await controller.setPauseAfterCurrent(true); // 同值
        expect(onChange.mock.calls).toEqual([[true]]);

        // 曲终消费 → 广播 false，消费方据此给「等待当前曲结束」收口
        capturedAudioEnd()(lastSetAudio().item, null);
        await controller.setRate(1);
        expect(onChange.mock.calls).toEqual([[true], [false]]);
    });

    it('竞态降级路径下标志不提前释放：原生仍晋升时不广播 false', async () => {
        const { controller, hooks } = makeController();
        const onChange = hooks.onPauseAfterCurrentChange as jest.Mock;
        await controller.setup();
        await controller.play(A);
        await controller.setPauseAfterCurrent(true);
        onChange.mockClear();

        const promotedB = {
            platform: 'demo',
            id: 'b',
            slotId: 999,
            cacheKey: 'demo:b:standard',
        } as unknown as AudioItem;
        capturedAudioEnd()(lastSetAudio().item, promotedB);
        await controller.setRate(1);

        // 标志还要管下一首，此刻不能说「已消费」，否则消费方会早收一首
        expect(onChange).not.toHaveBeenCalled();

        capturedAudioEnd()(promotedB, null);
        await controller.setRate(1);
        expect(onChange).toHaveBeenLastCalledWith(false);
    });

    it('桥失败时不广播假变更（否则与「被曲终消费」同形无从分辨）', async () => {
        const { controller, hooks } = makeController();
        const onChange = hooks.onPauseAfterCurrentChange as jest.Mock;
        await controller.setup();
        await controller.play(A);
        onChange.mockClear();
        engine.setNext.mockRejectedValueOnce(new Error('bridge down'));

        await controller.setPauseAfterCurrent(true);
        expect(onChange).not.toHaveBeenCalled(); // 没落地就不该说变了

        await controller.setPauseAfterCurrent(true); // 已回滚 → 重试能真下发
        expect(onChange.mock.calls).toEqual([[true]]);
    });

    it('reset 清场时一并清标志（队列空了不会再有曲终事件）', async () => {
        const { controller, hooks } = makeController();
        const onChange = hooks.onPauseAfterCurrentChange as jest.Mock;
        await controller.setup();
        await controller.play(A);
        await controller.setPauseAfterCurrent(true);
        onChange.mockClear();

        await controller.reset();
        expect(onChange).toHaveBeenLastCalledWith(false);
    });

    it('Single 循环下标志优先：放完这一遍即停，不再循环', async () => {
        const { controller } = makeController(RepeatMode.Single);
        await controller.setup();
        await controller.play(A);
        await controller.setPauseAfterCurrent(true);
        expect(engine.setNext).toHaveBeenLastCalledWith(null);

        const endedItem = lastSetAudio().item;
        capturedAudioEnd()(endedItem, null);
        await controller.setRate(1);

        // Single 的逻辑 next 是同曲 → 载入自身但不出声
        const after = lastSetAudio();
        expect(after.item).toMatchObject({ id: 'a' });
        expect(after.autoPlay).toBe(false);
    });

    it('未置位时原生未晋升仍续播（回归：装载失败恢复路径不受影响）', async () => {
        const { controller } = makeController();
        await controller.setup();
        await controller.play(A);
        const endedItem = lastSetAudio().item;

        capturedAudioEnd()(endedItem, null);
        await controller.setRate(1);

        const after = lastSetAudio();
        expect(after.item).toMatchObject({ id: 'b' });
        expect(after.autoPlay).toBe(true);
    });
});
