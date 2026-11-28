/**
 * Player 的「音质单一真相源」单测：真相源在 config，播放页命令与设置页 / 备份恢复三条写入路径同构
 * 重点覆盖 MMKV 变更回调是**同步**的这一前提——守卫顺序错了会重复重解析、或让命令提前 resolve
 * 原生桥与 session / slots / resolver / cache / store 全部 mock，只留 Player 自身的编排逻辑
 */
jest.mock('@/native/audioEngine', () => ({
    audioEngine: {
        setCustomNotificationButtons: jest.fn(),
        onCustomNotificationButton: jest.fn(() => () => undefined),
        getCacheSize: () => mockGetCacheSize(),
        clearCache: () => mockClearCache(),
        setMixWithOthers: (enabled: boolean) => mockSetMixWithOthers(enabled),
    },
    isPlaybackActive: () => false,
    PlaybackState: { Idle: 'idle', Playing: 'playing', Paused: 'paused' },
}));
jest.mock('@/infra/timer', () => ({
    delay: () => new Promise<void>(() => {}),
}));
jest.mock('./sourceCache', () => ({
    SourceCache: class {},
    sourceCacheKey: () => '',
}));
jest.mock('./sourceResolver', () => ({ SourceResolver: class {} }));

const mockReload = jest.fn(
    async (_resumePosition?: number): Promise<void> => undefined,
);
const mockSlotSetup = jest.fn<Promise<void>, [_options?: unknown]>(
    async () => undefined,
);
const mockSlotPlay = jest.fn<Promise<void>, [unknown, unknown?]>(
    async () => undefined,
);
const mockGetCacheSize = jest.fn(async () => 0);
const mockClearCache = jest.fn(async () => undefined);
const mockSetMixWithOthers = jest.fn();
/** 下发原生元数据的口，用例据此断言「哪些字段到了原生」 */
const mockSlotUpdateMeta = jest.fn(async (_item: unknown) => undefined);

/** 捕获 Player 装配给 SlotController 的 hooks，用例直接调它们模拟原生回调 */
let mockSlotHooks: Record<string, (...args: never[]) => unknown> | undefined;
jest.mock('./slots', () => ({
    SlotController: class {
        constructor(deps: {
            hooks: Record<string, (...args: never[]) => unknown>;
        }) {
            mockSlotHooks = deps.hooks;
        }
        setup = (options?: unknown) => mockSlotSetup(options);
        play = (item: unknown, options?: unknown) =>
            mockSlotPlay(item, options);
        setRate = jest.fn(async () => undefined);
        load = jest.fn(async () => undefined);
        seekTo = jest.fn(async () => undefined);
        resume = jest.fn(async () => undefined);
        reloadCurrentWithPreferredQuality = mockReload;
        updateCurrentMeta = (item: unknown) => mockSlotUpdateMeta(item);
    },
}));

const mockSessionRead = jest.fn(() => ({
    queue: [],
    queueOriginalOrder: undefined,
    currentMusic: null,
    position: 0,
    duration: 0,
    repeatMode: 'queue',
    playbackRate: 1,
}));
jest.mock('./session', () => ({
    PlayerSession: class {
        read = mockSessionRead;
        saveQueue = jest.fn();
        saveCurrentMusic = jest.fn();
        savePosition = jest.fn((s: number) => s);
        saveDuration = jest.fn((s: number) => s);
        saveRepeatMode = jest.fn();
        savePlaybackRate = jest.fn();
    },
}));

const mockPublishQuality = jest.fn();
jest.mock('./store', () => ({
    setCurrentMusic: jest.fn(),
    setQueue: jest.fn(),
    setRepeatMode: jest.fn(),
    // 包一层惰性调用：工厂在 import 提升后立刻执行，此时外层 const 还没赋值
    setPreferredQuality: (quality: string) => mockPublishQuality(quality),
    setPlaybackState: jest.fn(),
    getPlaybackState: () => 'idle',
    setProgress: jest.fn(),
    getProgress: () => ({ position: 0, duration: 0, buffered: 0 }),
    setPlaybackRate: jest.fn(),
}));

import { LOCAL_MEDIA_PLATFORM } from '@/utils/media';

import { Player } from '.';

import type { IConfig } from '@/core/config';
import type { IMediaMeta } from '@/core/mediaMeta';
import type { IPluginManager } from '@/core/plugin';
import type { MusicItem } from '@/types';

const QUALITY_KEY = 'basic.defaultPlayQuality';
const CACHE_SIZE_KEY = 'basic.maxCacheSize';
const DEFAULT_CACHE_BYTES = 512 * 1024 * 1024;

/** 同步派发的假 config：复刻 MMKV「set 内联通知监听器」的真实时序 */
function makeConfig(initial: Record<string, unknown> = {}) {
    const values: Record<string, unknown> = { ...initial };
    const listeners: { keys: readonly string[]; cb: () => void }[] = [];
    const config = {
        get: (key: string) =>
            values[key] ??
            (key === CACHE_SIZE_KEY ? DEFAULT_CACHE_BYTES : undefined),
        getStored: (key: string) => values[key],
        set: (key: string, value: unknown) => {
            values[key] = value;
            listeners.forEach(listener => {
                if (listener.keys.includes(key)) {
                    listener.cb();
                }
            });
        },
        isValid: (key: string, value: unknown) =>
            key !== 'basic.maxCacheSize' ||
            (typeof value === 'number' &&
                Number.isInteger(value) &&
                value >= 100 * 1024 * 1024 &&
                value <= 8192 * 1024 * 1024),
        subscribe: (keys: readonly string[], cb: () => void) => {
            listeners.push({ keys, cb });
            return () => undefined;
        },
    };
    return { config: config as unknown as IConfig, values };
}

function makePlayer(
    initial: Record<string, unknown> = {},
    pluginManager: IPluginManager = {
        getByMediaItem: () => undefined,
    } as unknown as IPluginManager,
) {
    const { config, values } = makeConfig(initial);
    const player = new Player({
        config,
        pluginManager,
        mediaMeta: {} as unknown as IMediaMeta,
    });
    return { player, config, values };
}

/** 让已排队的微任务跑完 */
const flush = () => new Promise<void>(resolve => setImmediate(resolve));

beforeEach(() => {
    jest.clearAllMocks();
    mockSlotHooks = undefined;
    mockReload.mockImplementation(async () => undefined);
    mockSlotSetup.mockImplementation(async () => undefined);
    mockGetCacheSize.mockResolvedValue(0);
    mockClearCache.mockResolvedValue(undefined);
});

describe('单次播放来源', () => {
    it('把首选路径交给 slot，但不写进队列 MusicItem', async () => {
        const item = {
            platform: 'demo',
            id: 'song-1',
            title: '标题',
        } as MusicItem;
        const { player } = makePlayer();

        await player.play(item, {
            preferredLocalPath: '/music/version-b.flac',
        });

        expect(mockSlotPlay).toHaveBeenCalledWith(item, {
            preferredLocalPath: '/music/version-b.flac',
        });
        expect(player.getQueue()).toEqual([item]);
        expect(player.getQueue()[0]).not.toHaveProperty('preferredLocalPath');
    });
});

describe('同时播放', () => {
    it.each([undefined, false, true])(
        'setup 读取旧配置值 %s',
        async enabled => {
            const { player } = makePlayer({ 'basic.notInterrupt': enabled });

            await player.setup();

            expect(mockSlotSetup).toHaveBeenCalledWith(
                expect.objectContaining({ mixWithOthers: enabled ?? false }),
            );
        },
    );

    it('配置开关和清除即时生效，不重载歌曲或重复订阅', async () => {
        const { player, config } = makePlayer();
        await player.setup();
        await player.setup();

        config.set('basic.notInterrupt', true);
        config.set('basic.notInterrupt', false);
        config.set('basic.notInterrupt');

        expect(mockSetMixWithOthers.mock.calls).toEqual([
            [true],
            [false],
            [false],
        ]);
        expect(mockSlotSetup).toHaveBeenCalledTimes(1);
        expect(mockReload).not.toHaveBeenCalled();
        expect(mockSlotPlay).not.toHaveBeenCalled();
    });

    it('初始化尚未完成时修改配置仍下发最新值', async () => {
        let finishSetup = () => undefined as void;
        mockSlotSetup.mockImplementation(
            () =>
                new Promise<void>(resolve => {
                    finishSetup = resolve;
                }),
        );
        const { player, config } = makePlayer();

        const pending = player.setup();
        config.set('basic.notInterrupt', true);
        expect(mockSetMixWithOthers).toHaveBeenCalledWith(true);

        finishSetup();
        await pending;
        expect(mockSlotSetup).toHaveBeenCalledWith(
            expect.objectContaining({ mixWithOthers: false }),
        );
    });
});

describe('流式缓存', () => {
    it('setup 开启缓存并传入已配置的容量', async () => {
        const maxCacheBytes = 1024 * 1024 * 1024;
        const { player } = makePlayer({ 'basic.maxCacheSize': maxCacheBytes });

        await player.setup();

        expect(mockSlotSetup).toHaveBeenCalledWith({
            cacheEnabled: true,
            maxCacheBytes,
            mixWithOthers: false,
        });
    });

    it('配置未存时传入中央默认容量', async () => {
        const { player } = makePlayer();

        await player.setup();

        expect(mockSlotSetup).toHaveBeenCalledWith({
            cacheEnabled: true,
            maxCacheBytes: DEFAULT_CACHE_BYTES,
            mixWithOthers: false,
        });
    });

    it('容量非法时只开启缓存，由桥层使用默认容量', async () => {
        const { player } = makePlayer({ [CACHE_SIZE_KEY]: 1024 });

        await player.setup();

        expect(mockSlotSetup).toHaveBeenCalledWith({
            cacheEnabled: true,
            mixWithOthers: false,
        });
    });

    it('setup 完成后才查询缓存大小', async () => {
        let finishSetup = () => undefined as void;
        mockSlotSetup.mockImplementation(
            () =>
                new Promise<void>(resolve => {
                    finishSetup = resolve;
                }),
        );
        mockGetCacheSize.mockResolvedValue(128 * 1024 * 1024);
        const { player } = makePlayer();

        const pending = player.getStreamingCacheSize();
        await flush();
        expect(mockGetCacheSize).not.toHaveBeenCalled();

        finishSetup();
        await expect(pending).resolves.toBe(128 * 1024 * 1024);
        expect(mockSlotSetup).toHaveBeenCalledTimes(1);
        expect(mockGetCacheSize).toHaveBeenCalledTimes(1);
    });

    it('setup 完成后才清理，随后回读并返回实际剩余量', async () => {
        let finishSetup = () => undefined as void;
        mockSlotSetup.mockImplementation(
            () =>
                new Promise<void>(resolve => {
                    finishSetup = resolve;
                }),
        );
        mockGetCacheSize.mockResolvedValue(4096);
        const { player } = makePlayer();

        const pending = player.clearStreamingCache();
        await flush();
        expect(mockClearCache).not.toHaveBeenCalled();
        expect(mockGetCacheSize).not.toHaveBeenCalled();

        finishSetup();
        await expect(pending).resolves.toBe(4096);
        expect(mockClearCache).toHaveBeenCalledTimes(1);
        expect(mockGetCacheSize).toHaveBeenCalledTimes(1);
        expect(mockClearCache.mock.invocationCallOrder[0]).toBeLessThan(
            mockGetCacheSize.mock.invocationCallOrder[0]!,
        );
    });
});

describe('音质真相源', () => {
    it('setup 后运行态取自 config，而不是内置默认', async () => {
        const { player } = makePlayer({ [QUALITY_KEY]: 'super' });

        await player.setup();

        expect(player.getPreferredQuality()).toBe('super');
        expect(mockPublishQuality).toHaveBeenCalledWith('super');
    });

    it('config 未设时回落到内置默认', async () => {
        const { player } = makePlayer();

        await player.setup();

        expect(player.getPreferredQuality()).toBe('standard');
    });

    it('setPreferredQuality 落库到 config，且只重解析一次', async () => {
        const { player, values } = makePlayer({ [QUALITY_KEY]: 'standard' });
        await player.setup();

        await player.setPreferredQuality('high');

        expect(values[QUALITY_KEY]).toBe('high');
        expect(player.getPreferredQuality()).toBe('high');
        // 同步回调若没被守卫吃掉，这里会是 2
        expect(mockReload).toHaveBeenCalledTimes(1);
    });

    it('setPreferredQuality 的 promise 等到重解析真正完成才 resolve', async () => {
        const { player } = makePlayer({ [QUALITY_KEY]: 'standard' });
        await player.setup();
        let finishReload = () => undefined as void;
        mockReload.mockImplementation(
            () =>
                new Promise<void>(resolve => {
                    finishReload = () => resolve();
                }),
        );

        let settled = false;
        const pending = player.setPreferredQuality('high').then(() => {
            settled = true;
        });
        await flush();
        expect(settled).toBe(false);

        finishReload();
        await pending;
        expect(settled).toBe(true);
    });

    it('别处写 config（设置页 / 备份恢复）同样驱动运行态与重解析', async () => {
        const { player, config } = makePlayer({ [QUALITY_KEY]: 'standard' });
        await player.setup();

        config.set(QUALITY_KEY, 'low');
        await flush();

        expect(player.getPreferredQuality()).toBe('low');
        expect(mockPublishQuality).toHaveBeenCalledWith('low');
        expect(mockReload).toHaveBeenCalledTimes(1);
    });

    it('写入相同值不重解析', async () => {
        const { player, config } = makePlayer({ [QUALITY_KEY]: 'standard' });
        await player.setup();

        config.set(QUALITY_KEY, 'standard');
        await player.setPreferredQuality('standard');
        await flush();

        expect(mockReload).not.toHaveBeenCalled();
    });

    it('重解析带上待恢复位置，由 slots 在同一事务内跳回', async () => {
        const { player } = makePlayer({ [QUALITY_KEY]: 'standard' });
        await player.setup();

        await player.setPreferredQuality('high');

        // 无播放位置时传 0；位置账本由 Player 维护，这里只锁定「位置随命令一起下去」的契约
        expect(mockReload).toHaveBeenCalledWith(0);
    });
});

describe('内嵌封面回填', () => {
    const storeMock = jest.requireMock('./store') as {
        setCurrentMusic: jest.Mock;
    };
    const track = (over: Partial<MusicItem> = {}): MusicItem =>
        ({ platform: 'dav', id: 'x', title: 'x', ...over } as MusicItem);
    const hooks = () => {
        if (!mockSlotHooks) {
            throw new Error('hooks 未捕获');
        }
        return mockSlotHooks as unknown as {
            onCurrentChange: (item: MusicItem | null) => void;
            onPlaybackStarted: (item: MusicItem) => void;
            onEmbeddedArtwork: (item: MusicItem, uri: string) => void;
        };
    };
    const publishedCurrent = () =>
        storeMock.setCurrentMusic.mock.calls.at(-1)?.[0] as
            | MusicItem
            | null
            | undefined;
    /** 带 getMusicInfo 的插件假体 */
    const pluginsWith = (getMusicInfo: jest.Mock): IPluginManager =>
        ({
            getByMediaItem: () => ({
                supportedMethods: new Set(['getMusicInfo']),
                methods: { getMusicInfo },
            }),
        } as unknown as IPluginManager);

    it('当前曲没有封面 → 用原生解出的缓存文件补上并发布', async () => {
        const { player } = makePlayer();
        await player.setup();
        const item = track();
        hooks().onCurrentChange(item);
        storeMock.setCurrentMusic.mockClear();

        hooks().onEmbeddedArtwork(item, 'file:///cache/embeddedArtwork/x.jpg');

        expect(publishedCurrent()).toMatchObject({
            id: 'x',
            artwork: 'file:///cache/embeddedArtwork/x.jpg',
        });
        expect(player.getCurrentMusic()?.artwork).toBe(
            'file:///cache/embeddedArtwork/x.jpg',
        );
        // 不下发原生：进了槽的 item 会让重建槽时原生跳过解析，缓存文件被清后留死链
        expect(mockSlotUpdateMeta).not.toHaveBeenCalled();
    });

    it('插件已经给了封面 → 不覆盖', async () => {
        const { player } = makePlayer();
        await player.setup();
        const item = track({ artwork: 'https://cdn/plugin.jpg' });
        hooks().onCurrentChange(item);
        storeMock.setCurrentMusic.mockClear();

        hooks().onEmbeddedArtwork(item, 'file:///cache/embeddedArtwork/x.jpg');

        expect(storeMock.setCurrentMusic).not.toHaveBeenCalled();
        expect(player.getCurrentMusic()?.artwork).toBe(
            'https://cdn/plugin.jpg',
        );
    });

    it('内嵌封面先到、随后才开播：插件 getMusicInfo 照常被调用，其封面压过内嵌的', async () => {
        const getMusicInfo = jest.fn(async () => ({
            artwork: 'https://cdn/plugin.jpg',
            artist: 'P',
        }));
        const { player } = makePlayer({}, pluginsWith(getMusicInfo));
        await player.setup();
        const item = track();
        hooks().onCurrentChange(item);

        hooks().onEmbeddedArtwork(item, 'file:///cache/embeddedArtwork/x.jpg');
        expect(player.getCurrentMusic()?.artwork).toBe(
            'file:///cache/embeddedArtwork/x.jpg',
        );
        hooks().onPlaybackStarted(item);
        await flush();

        expect(getMusicInfo).toHaveBeenCalledTimes(1);
        expect(player.getCurrentMusic()).toMatchObject({
            artwork: 'https://cdn/plugin.jpg',
            artist: 'P',
        });
        expect(mockSlotUpdateMeta).toHaveBeenLastCalledWith(
            expect.objectContaining({ artwork: 'https://cdn/plugin.jpg' }),
        );
    });

    it('插件补丁没带封面：界面保留内嵌封面，但下发原生的元数据里把内嵌地址剥掉', async () => {
        const getMusicInfo = jest.fn(async () => ({ artist: 'P' }));
        const { player } = makePlayer({}, pluginsWith(getMusicInfo));
        await player.setup();
        const item = track();
        hooks().onCurrentChange(item);

        hooks().onEmbeddedArtwork(item, 'file:///cache/embeddedArtwork/x.jpg');
        hooks().onPlaybackStarted(item);
        await flush();

        expect(player.getCurrentMusic()).toMatchObject({
            artwork: 'file:///cache/embeddedArtwork/x.jpg',
            artist: 'P',
        });
        expect(mockSlotUpdateMeta).toHaveBeenCalledTimes(1);
        expect(
            (mockSlotUpdateMeta.mock.calls[0]?.[0] as MusicItem).artwork,
        ).toBe('');
    });

    it('插件封面已进补充信息缓存 → 之后到的内嵌封面不覆盖', async () => {
        const getMusicInfo = jest.fn(async () => ({
            artwork: 'https://cdn/plugin.jpg',
        }));
        const { player } = makePlayer({}, pluginsWith(getMusicInfo));
        await player.setup();
        const item = track();
        hooks().onCurrentChange(item);
        hooks().onPlaybackStarted(item);
        await flush();
        storeMock.setCurrentMusic.mockClear();

        hooks().onEmbeddedArtwork(item, 'file:///cache/embeddedArtwork/x.jpg');

        expect(storeMock.setCurrentMusic).not.toHaveBeenCalled();
        expect(player.getCurrentMusic()?.artwork).toBe(
            'https://cdn/plugin.jpg',
        );
    });

    it('本地歌不走这条：内嵌封面交给 localPlugin 的既有链路', async () => {
        const { player } = makePlayer();
        await player.setup();
        const item = track({ platform: LOCAL_MEDIA_PLATFORM });
        hooks().onCurrentChange(item);
        storeMock.setCurrentMusic.mockClear();

        hooks().onEmbeddedArtwork(item, 'file:///cache/embeddedArtwork/x.jpg');

        expect(storeMock.setCurrentMusic).not.toHaveBeenCalled();
    });
});
