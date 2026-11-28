/**
 * 音源解析的流量闸
 *
 * 闸门夹在「本地文件」与「联网解析」之间：本地与已下载的歌照放，其余一律要花流量——
 * 包括缓存里那条早先解析出的 URL（放它同样是联网串流）
 */
import { SourceResolver } from './sourceResolver';

import type { SourceCache } from './sourceCache';
import type { IConfig } from '@/core/config';
import type { IMediaMeta } from '@/core/mediaMeta';
import type { IPluginManager, Plugin } from '@/core/plugin';
import type { NetworkClass } from '@/infra/network';
import type { MusicItem, QualityKey } from '@/types';

const fetchNetwork = jest.fn<Promise<NetworkClass>, []>();
const networkListeners = new Set<(n: NetworkClass) => void>();

// resolver 只用到 StreamType 这个纯枚举；桥本体在测试环境注册不了
jest.mock('@/native/audioEngine', () => ({
    StreamType: { Progressive: 'progressive', Hls: 'hls', Dash: 'dash' },
}));

// sourceCache 构造即开 MMKV（ESM，Jest 不转译）；本用例用假 cache，切断这条 import 链即可
jest.mock('@/infra/storage', () => ({
    getOrCreateMMKV: () => ({}),
    getObject: () => undefined,
    setObject: () => true,
}));

jest.mock('@/infra/network', () => ({
    getNetworkClass: () => mockFetchNetwork(),
    onNetworkClassChange: (cb: (n: NetworkClass) => void) => {
        mockListeners().add(cb);
        return () => mockListeners().delete(cb);
    },
}));

// jest.mock 工厂被提升到变量初始化之前，故经函数惰性取
const mockFetchNetwork = () => fetchNetwork();
const mockListeners = () => networkListeners;

const exists = jest.fn<Promise<boolean>, [string]>();
jest.mock('@dr.pogodin/react-native-fs', () => ({
    exists: (path: string) => mockExists(path),
}));
const mockExists = (path: string) => exists(path);

// delay 立即结算（getMediaSource 重试前那 150ms 不必真等）；withTimeout 按 infra/timer 的契约复刻
// （超时抛 TimeoutError、结算后清掉计时器），真实现依赖原生计时器桥，测试环境装不上
jest.mock('@/infra/timer', () => {
    class TimeoutError extends Error {}
    return {
        TimeoutError,
        delay: () => Promise.resolve(),
        withTimeout: <T>(promise: Promise<T>, ms: number) => {
            let timer: ReturnType<typeof setTimeout> | undefined;
            return Promise.race([
                promise,
                new Promise<never>((_resolve, reject) => {
                    timer = setTimeout(() => reject(new TimeoutError()), ms);
                }),
            ]).finally(() => clearTimeout(timer));
        },
    };
});

const item = { platform: 'demo', id: 's1', title: 't' } as MusicItem;

/** 只实现闸门路径与音质回退链用得到的口；给了 plugin 时缓存假体会真跑 factory（要数的就是插件被打了几次） */
function createResolver(over: {
    allowCellular?: boolean;
    localPath?: string;
    localQuality?: QualityKey;
    cachedUrl?: string;
    plugin?: Plugin;
    localFiles?: ReturnType<IMediaMeta['getLocalFiles']>;
}) {
    const config = {
        get: (key: string) =>
            key === 'basic.useCelluarNetworkPlay'
                ? over.allowCellular
                : undefined,
    } as unknown as IConfig;
    const mediaMeta = {
        getLocalFiles: () =>
            over.localFiles ??
            (over.localPath
                ? [{ path: over.localPath, quality: over.localQuality }]
                : []),
    } as unknown as IMediaMeta;
    const resolveWith = jest.fn(
        async (
            _key: string,
            factory: () => Promise<{ resolved: unknown } | null>,
        ) => {
            if (over.plugin) {
                return (await factory())?.resolved ?? null;
            }
            return over.cachedUrl
                ? {
                      source: { url: over.cachedUrl },
                      streamType: 'progressive',
                      quality: 'standard',
                  }
                : null;
        },
    );
    const rememberStreamType = jest.fn();
    const cache = {
        rememberStreamType,
        resolveWith,
    } as unknown as SourceCache;
    const plugins = {
        getAlternative: () => null,
        getByPlatform: () => undefined,
        getByMediaItem: () => over.plugin,
        getAll: () => [],
        isEnabled: () => true,
    } as unknown as IPluginManager;
    const resolver = new SourceResolver({
        pluginManager: plugins,
        mediaMeta,
        config,
        cache,
    });
    return { resolver, resolveWith, rememberStreamType };
}

/** 把订阅推到某个网络归类（模拟 netinfo 首报） */
function reportNetwork(network: NetworkClass): void {
    networkListeners.forEach(cb => cb(network));
}

beforeEach(() => {
    networkListeners.clear();
    fetchNetwork.mockReset();
    fetchNetwork.mockResolvedValue('nonCellular');
    exists.mockReset();
    exists.mockResolvedValue(true);
});

describe('本地文件候选', () => {
    const localFiles: ReturnType<IMediaMeta['getLocalFiles']> = [
        { path: '/download/old.mp3', quality: 'low' },
        { path: '/music/moved.mp3' },
    ];

    it('旧下载路径失效时使用扫描候选，不查询在线缓存', async () => {
        const { resolver, resolveWith } = createResolver({
            localFiles,
            cachedUrl: 'https://cdn/online.mp3',
        });
        exists.mockImplementation(async path => path === '/music/moved.mp3');

        const outcome = await resolver.resolve(item, 'high');

        expect(outcome).toMatchObject({
            ok: true,
            source: {
                source: { url: 'file:///music/moved.mp3' },
                streamType: 'progressive',
                quality: 'high',
            },
        });
        expect(exists.mock.calls).toEqual([
            ['/download/old.mp3'],
            ['/music/moved.mp3'],
        ]);
        expect(resolveWith).not.toHaveBeenCalled();
        expect(fetchNetwork).not.toHaveBeenCalled();
    });

    it('下载与扫描候选都可用时仍优先下载，并返回它的实际音质', async () => {
        const { resolver, resolveWith } = createResolver({ localFiles });

        expect(await resolver.resolve(item, 'super')).toMatchObject({
            ok: true,
            source: {
                source: { url: 'file:///download/old.mp3' },
                quality: 'low',
            },
        });
        expect(exists.mock.calls).toEqual([['/download/old.mp3']]);
        expect(resolveWith).not.toHaveBeenCalled();
    });

    it('显式路径和下载路径都失效时继续探测扫描路径', async () => {
        const { resolver, resolveWith } = createResolver({ localFiles });
        exists.mockImplementation(async path => path === '/music/moved.mp3');

        expect(
            await resolver.resolve(item, 'standard', {
                preferredLocalPath: '/chosen/missing.flac',
            }),
        ).toMatchObject({
            ok: true,
            source: { source: { url: 'file:///music/moved.mp3' } },
        });
        expect(exists.mock.calls).toEqual([
            ['/chosen/missing.flac'],
            ['/download/old.mp3'],
            ['/music/moved.mp3'],
        ]);
        expect(resolveWith).not.toHaveBeenCalled();
    });

    it('显式路径与下载候选相同时只探测一次，保留下载音质', async () => {
        const { resolver } = createResolver({ localFiles });
        exists.mockResolvedValue(false);

        await resolver.resolve(item, 'high', {
            preferredLocalPath: '/download/old.mp3',
        });

        expect(exists.mock.calls).toEqual([
            ['/download/old.mp3'],
            ['/music/moved.mp3'],
        ]);
        exists.mockClear();
        exists.mockResolvedValue(true);
        expect(
            await resolver.resolve(item, 'high', {
                preferredLocalPath: '/download/old.mp3',
            }),
        ).toMatchObject({ ok: true, source: { quality: 'low' } });
        expect(exists).toHaveBeenCalledTimes(1);
    });

    it('显式选择扫描候选时不继承另一下载文件的音质，也不修改候选快照', async () => {
        const snapshot = Object.freeze(
            localFiles.map(file => Object.freeze({ ...file })),
        );
        const { resolver } = createResolver({ localFiles: snapshot });

        expect(
            await resolver.resolve(item, 'high', {
                preferredLocalPath: '/music/moved.mp3',
            }),
        ).toMatchObject({
            ok: true,
            source: {
                source: { url: 'file:///music/moved.mp3' },
                quality: 'high',
            },
        });
        expect(exists.mock.calls).toEqual([['/music/moved.mp3']]);
        expect(snapshot).toEqual(localFiles);
    });

    it('下载路径探测抛错时仍尝试扫描候选', async () => {
        const { resolver, resolveWith } = createResolver({ localFiles });
        exists.mockRejectedValueOnce(new Error('storage unavailable'));

        expect(await resolver.resolve(item, 'standard')).toMatchObject({
            ok: true,
            source: { source: { url: 'file:///music/moved.mp3' } },
        });
        expect(exists.mock.calls).toEqual([
            ['/download/old.mp3'],
            ['/music/moved.mp3'],
        ]);
        expect(resolveWith).not.toHaveBeenCalled();
    });

    it('下载路径探测超时后继续扫描候选，不提前联网', async () => {
        jest.useFakeTimers();
        try {
            const { resolver, resolveWith } = createResolver({ localFiles });
            exists.mockImplementation(path =>
                path === '/download/old.mp3'
                    ? new Promise<boolean>(() => undefined)
                    : Promise.resolve(true),
            );

            const pending = resolver.resolve(item, 'standard');
            await jest.advanceTimersByTimeAsync(1499);
            expect(exists).toHaveBeenCalledTimes(1);
            expect(resolveWith).not.toHaveBeenCalled();
            await jest.advanceTimersByTimeAsync(1);

            expect(await pending).toMatchObject({
                ok: true,
                source: { source: { url: 'file:///music/moved.mp3' } },
            });
            expect(exists).toHaveBeenCalledTimes(2);
            expect(resolveWith).not.toHaveBeenCalled();
            expect(jest.getTimerCount()).toBe(0);
        } finally {
            jest.useRealTimers();
        }
    });

    it('三个候选都超时后才进入原有在线分支，等待有界', async () => {
        jest.useFakeTimers();
        try {
            const { resolver, resolveWith } = createResolver({
                localFiles,
                cachedUrl: 'https://cdn/online.mp3',
            });
            reportNetwork('nonCellular');
            exists.mockImplementation(
                () => new Promise<boolean>(() => undefined),
            );
            const pending = resolver.resolve(item, 'standard', {
                preferredLocalPath: '/chosen/missing.flac',
            });

            await jest.advanceTimersByTimeAsync(4499);
            expect(resolveWith).not.toHaveBeenCalled();
            await jest.advanceTimersByTimeAsync(1);

            expect(await pending).toMatchObject({
                ok: true,
                source: { source: { url: 'https://cdn/online.mp3' } },
            });
            expect(exists).toHaveBeenCalledTimes(3);
            expect(resolveWith).toHaveBeenCalledTimes(1);
            expect(jest.getTimerCount()).toBe(0);
        } finally {
            jest.useRealTimers();
        }
    });

    it('不缓存候选缺失结果，下次文件恢复后优先本地', async () => {
        const { resolver, resolveWith } = createResolver({
            localFiles,
            cachedUrl: 'https://cdn/online.mp3',
        });
        reportNetwork('nonCellular');
        exists.mockResolvedValue(false);
        expect(await resolver.resolve(item, 'standard')).toMatchObject({
            source: { source: { url: 'https://cdn/online.mp3' } },
        });
        resolveWith.mockClear();
        exists.mockClear();
        exists.mockImplementation(async path => path === '/music/moved.mp3');

        expect(await resolver.resolve(item, 'standard')).toMatchObject({
            source: { source: { url: 'file:///music/moved.mp3' } },
        });
        expect(exists).toHaveBeenCalledTimes(2);
        expect(resolveWith).not.toHaveBeenCalled();
    });

    it.each(['cellular', 'unknown'] as const)(
        '%s 网络下仍在闸门之前命中扫描候选',
        async network => {
            const { resolver, resolveWith } = createResolver({ localFiles });
            reportNetwork(network);
            exists.mockImplementation(
                async path => path === '/music/moved.mp3',
            );

            expect(await resolver.resolve(item, 'standard')).toMatchObject({
                ok: true,
                source: { source: { url: 'file:///music/moved.mp3' } },
            });
            expect(fetchNetwork).not.toHaveBeenCalled();
            expect(resolveWith).not.toHaveBeenCalled();
        },
    );

    it('全部候选失效后仍遵守移动网络限制', async () => {
        const { resolver, resolveWith } = createResolver({ localFiles });
        reportNetwork('cellular');
        exists.mockResolvedValue(false);

        expect(await resolver.resolve(item, 'standard')).toEqual({
            ok: false,
            reason: 'cellularBlocked',
        });
        expect(exists).toHaveBeenCalledTimes(2);
        expect(resolveWith).not.toHaveBeenCalled();
    });

    it('扫描候选命中后更新 progressive 类型记忆并沿用 URI 编码', async () => {
        const path = '/music/中文 #100%.mp3';
        const { resolver, rememberStreamType } = createResolver({
            localFiles: [localFiles[0]!, { path }],
        });
        exists.mockImplementation(async candidate => candidate === path);

        expect(await resolver.resolve(item, 'high')).toMatchObject({
            ok: true,
            source: {
                source: {
                    url: 'file:///music/%E4%B8%AD%E6%96%87%20%23100%25.mp3',
                },
                streamType: 'progressive',
            },
        });
        expect(rememberStreamType).toHaveBeenCalledWith(
            JSON.stringify([item.platform, item.id, 'high']),
            'progressive',
        );
    });
});

describe('流量闸', () => {
    it('Wi-Fi 下放行', async () => {
        const { resolver, resolveWith } = createResolver({
            cachedUrl: 'https://ex/a.mp3',
        });
        reportNetwork('nonCellular');

        const outcome = await resolver.resolve(item, 'standard');

        expect(outcome).toMatchObject({ ok: true });
        expect(resolveWith).toHaveBeenCalled();
    });

    it('移动网络下拦截，且不发起任何解析', async () => {
        const { resolver, resolveWith } = createResolver({
            cachedUrl: 'https://ex/a.mp3',
        });
        reportNetwork('cellular');

        const outcome = await resolver.resolve(item, 'standard');

        expect(outcome).toEqual({ ok: false, reason: 'cellularBlocked' });
        // 连缓存都不问：缓存里那条 URL 放起来同样走流量
        expect(resolveWith).not.toHaveBeenCalled();
    });

    it('开关打开时移动网络放行', async () => {
        const { resolver, resolveWith } = createResolver({
            allowCellular: true,
            cachedUrl: 'https://ex/a.mp3',
        });
        reportNetwork('cellular');

        const outcome = await resolver.resolve(item, 'standard');

        expect(outcome).toMatchObject({ ok: true });
        expect(resolveWith).toHaveBeenCalled();
    });

    it('本地 / 已下载的文件不过闸', async () => {
        const { resolver, resolveWith } = createResolver({
            localPath: '/music/a.mp3',
        });
        reportNetwork('cellular');

        const outcome = await resolver.resolve(item, 'standard');

        expect(outcome).toMatchObject({ ok: true });
        expect(resolveWith).not.toHaveBeenCalled();
    });

    it('本地文件已丢失时回到联网路径，照样被拦', async () => {
        const { resolver } = createResolver({ localPath: '/music/gone.mp3' });
        exists.mockResolvedValue(false);
        reportNetwork('cellular');

        const outcome = await resolver.resolve(item, 'standard');

        expect(outcome).toEqual({ ok: false, reason: 'cellularBlocked' });
    });

    it('本次首选文件优先于 mediaMeta 锚点', async () => {
        const { resolver, resolveWith } = createResolver({
            localPath: '/download/a.mp3',
        });

        const outcome = await resolver.resolve(item, 'standard', {
            preferredLocalPath: '/music/b.flac',
        });

        expect(outcome).toMatchObject({
            ok: true,
            source: { source: { url: 'file:///music/b.flac' } },
        });
        expect(exists).toHaveBeenCalledTimes(1);
        expect(exists).toHaveBeenCalledWith('/music/b.flac');
        expect(resolveWith).not.toHaveBeenCalled();
    });

    it('本次首选文件不可用时回退 mediaMeta 锚点', async () => {
        const { resolver, resolveWith } = createResolver({
            localPath: '/download/a.mp3',
        });
        exists.mockImplementation(async path => path === '/download/a.mp3');

        const outcome = await resolver.resolve(item, 'high', {
            preferredLocalPath: '/music/gone.flac',
        });

        expect(outcome).toMatchObject({
            ok: true,
            source: { source: { url: 'file:///download/a.mp3' } },
        });
        expect(exists.mock.calls).toEqual([
            ['/music/gone.flac'],
            ['/download/a.mp3'],
        ]);
        expect(resolveWith).not.toHaveBeenCalled();
    });

    it('本次首选文件与锚点相同时只探测一次，并保留锚点的实际音质', async () => {
        const { resolver } = createResolver({
            localPath: '/music/a.mp3',
            localQuality: 'low',
        });

        const outcome = await resolver.resolve(item, 'high', {
            preferredLocalPath: '/music/a.mp3',
        });

        expect(exists).toHaveBeenCalledTimes(1);
        expect(outcome).toMatchObject({
            ok: true,
            source: { quality: 'low' },
        });
    });

    it('订阅首报未到时现查一次，Wi-Fi 则放行', async () => {
        const { resolver, resolveWith } = createResolver({
            cachedUrl: 'https://ex/a.mp3',
        });
        fetchNetwork.mockResolvedValue('nonCellular');

        // 不推首报，模拟冷启动自动续播落在订阅窗口内
        const outcome = await resolver.resolve(item, 'standard');

        expect(fetchNetwork).toHaveBeenCalledTimes(1);
        expect(outcome).toMatchObject({ ok: true });
        expect(resolveWith).toHaveBeenCalled();
    });

    it('现查仍判不出网络时按拦处理', async () => {
        const { resolver } = createResolver({ cachedUrl: 'https://ex/a.mp3' });
        fetchNetwork.mockResolvedValue('unknown');

        const outcome = await resolver.resolve(item, 'standard');

        expect(outcome).toEqual({ ok: false, reason: 'cellularBlocked' });
    });

    it('现查结果被记住，后续解析不再重复查', async () => {
        const { resolver } = createResolver({ cachedUrl: 'https://ex/a.mp3' });
        fetchNetwork.mockResolvedValue('nonCellular');

        await resolver.resolve(item, 'standard');
        await resolver.resolve(item, 'standard');

        expect(fetchNetwork).toHaveBeenCalledTimes(1);
    });

    it('解析不到源时是 unavailable 而非被拦', async () => {
        const { resolver } = createResolver({});
        reportNetwork('nonCellular');

        const outcome = await resolver.resolve(item, 'standard');

        expect(outcome).toEqual({ ok: false, reason: 'unavailable' });
    });

    it('本地曲库的歌不过闸（锚点丢了也不按联网拦）', async () => {
        // localPlugin 直接回 item.url 的 file://，不花流量
        const { resolver, resolveWith } = createResolver({
            cachedUrl: 'file:///music/a.mp3',
        });
        reportNetwork('cellular');

        const outcome = await resolver.resolve(
            { ...item, platform: '本地' } as MusicItem,
            'standard',
        );

        expect(outcome).toMatchObject({ ok: true });
        expect(resolveWith).toHaveBeenCalled();
    });

    it('补查失败按拦处理，不把异常抛给调用方', async () => {
        const { resolver } = createResolver({ cachedUrl: 'https://ex/a.mp3' });
        fetchNetwork.mockRejectedValue(new Error('bridge down'));

        await expect(resolver.resolve(item, 'standard')).resolves.toEqual({
            ok: false,
            reason: 'cellularBlocked',
        });
    });

    it('补查期间订阅报了新值，以订阅为准', async () => {
        const { resolver, resolveWith } = createResolver({
            cachedUrl: 'https://ex/a.mp3',
        });
        // 补查慢一拍返回 nonCellular，其间订阅先报 cellular
        fetchNetwork.mockImplementation(async () => {
            reportNetwork('cellular');
            return 'nonCellular';
        });

        const outcome = await resolver.resolve(item, 'standard');

        expect(outcome).toEqual({ ok: false, reason: 'cellularBlocked' });
        expect(resolveWith).not.toHaveBeenCalled();
    });

    it('解析期间切到移动网络，解析成功也不放行', async () => {
        const { resolver, resolveWith } = createResolver({
            cachedUrl: 'https://ex/a.mp3',
        });
        reportNetwork('nonCellular');
        resolveWith.mockImplementation(async () => {
            reportNetwork('cellular');
            return {
                source: { url: 'https://ex/a.mp3' },
                streamType: 'progressive',
                quality: 'standard',
            };
        });

        const outcome = await resolver.resolve(item, 'standard');

        expect(outcome).toEqual({ ok: false, reason: 'cellularBlocked' });
    });
});

describe('音质回退链', () => {
    /** 只带 getMediaSource 的插件假体 */
    function pluginWith(getMediaSource: jest.Mock): Plugin {
        return {
            platform: 'demo',
            supportedMethods: new Set(['getMediaSource']),
            methods: { getMediaSource },
            definition: {},
        } as unknown as Plugin;
    }

    it('这一档没有源（返回空）→ 继续回退下一档', async () => {
        const getMediaSource = jest
            .fn()
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce({ url: 'https://cdn/high.mp3' });
        const { resolver } = createResolver({
            plugin: pluginWith(getMediaSource),
        });

        const outcome = await resolver.resolve(item, 'standard');

        expect(outcome.ok).toBe(true);
        expect(getMediaSource.mock.calls.map(c => c[1])).toEqual([
            'standard',
            'high',
        ]);
    });

    it('这一档抛错 → 第一档重试一次后换下一档，别档能播就照常出声', async () => {
        const getMediaSource = jest
            .fn()
            .mockRejectedValueOnce(new Error('403'))
            .mockRejectedValueOnce(new Error('403'))
            .mockResolvedValueOnce({ url: 'https://cdn/high.mp3' });
        const { resolver } = createResolver({
            plugin: pluginWith(getMediaSource),
        });

        const outcome = await resolver.resolve(item, 'standard');

        expect(outcome.ok).toBe(true);
        expect(getMediaSource.mock.calls.map(c => c[1])).toEqual([
            'standard',
            'standard',
            'high',
        ]);
    });

    it('插件整体坏掉：四档一共 5 次调用（首档 2 次、其余各 1 次），不再是 8 次', async () => {
        const getMediaSource = jest.fn().mockRejectedValue(new Error('boom'));
        const { resolver } = createResolver({
            plugin: pluginWith(getMediaSource),
        });

        const outcome = await resolver.resolve(item, 'standard');

        expect(outcome).toEqual({ ok: false, reason: 'unavailable' });
        expect(getMediaSource.mock.calls.map(c => c[1])).toEqual([
            'standard',
            'standard',
            'high',
            'super',
            'low',
        ]);
    });

    it("插件自己 reject 的 Error('timeout') 只是普通报错：换下一档，不当成我们的超时掐断整链", async () => {
        const getMediaSource = jest
            .fn()
            .mockRejectedValueOnce(new Error('timeout'))
            .mockRejectedValueOnce(new Error('timeout'))
            .mockResolvedValueOnce({ url: 'https://cdn/high.mp3' });
        const { resolver } = createResolver({
            plugin: pluginWith(getMediaSource),
        });

        const outcome = await resolver.resolve(item, 'standard');

        expect(outcome.ok).toBe(true);
        expect(getMediaSource).toHaveBeenCalledTimes(3);
    });

    it('超时 → 不重试、不换档，整条链中断', async () => {
        jest.useFakeTimers();
        try {
            const getMediaSource = jest.fn(() => new Promise(() => {}));
            const { resolver } = createResolver({
                plugin: pluginWith(getMediaSource),
            });

            const pending = resolver.resolve(item, 'standard');
            // 单次 getMediaSource 超时 10s（GETMEDIASOURCE_TIMEOUT_MS）；一档超时后不该再有第二档的 10s
            await jest.advanceTimersByTimeAsync(10_000);
            const outcome = await pending;

            expect(outcome).toEqual({ ok: false, reason: 'unavailable' });
            expect(getMediaSource).toHaveBeenCalledTimes(1);
        } finally {
            jest.useRealTimers();
        }
    });
});
