import { atomStore } from '@/utils/atomStore';
import { mediaKey } from '@/utils/media';

import {
    deleteCustomLyric,
    pruneLyricCache,
    readCachedLyric,
    readCustomLyric,
    writeCachedLyric,
    writeCachedMiss,
    writeCustomLyric,
} from './fileStore';
import { currentLineAtom, lyricAtom } from './store';

import { Lyric, LYRIC_MAX_LENGTH } from '.';

import type { EffectiveLyric, LyricText } from './types';
import type { IConfig } from '@/core/config';
import type { IMediaMeta } from '@/core/mediaMeta';
import type { IPlayer } from '@/core/player';
import type { IPluginManager, Plugin } from '@/core/plugin';
import type { Progress } from '@/native/audioEngine';
import type { LyricOverride, MediaRef, MusicItem, RawLyric } from '@/types';

/**
 * 文件缓存默认恒 miss、写入恒成功、无自定义词
 * 这样既有用例的行为与接缓存之前一致（每次都走插件），缓存分支另起 describe 单测
 */
jest.mock('./fileStore', () => ({
    readCachedLyric: jest.fn(async () => ({ kind: 'absent' })),
    readCustomLyric: jest.fn(async () => null),
    writeCustomLyric: jest.fn(async () => undefined),
    writeCachedLyric: jest.fn(async () => undefined),
    writeCachedMiss: jest.fn(async () => undefined),
    deleteCustomLyric: jest.fn(async () => undefined),
    pruneLyricCache: jest.fn(async () => undefined),
}));

// 自动搜索超时走原生 background timer；单测中的插件 Promise 由各用例显式结算
jest.mock('@/infra/timer', () => ({
    delay: () => new Promise<void>(() => {}),
    withTimeout: <T>(promise: Promise<T>) => promise,
}));

const mockReadCache = jest.mocked(readCachedLyric);
const mockReadCustom = jest.mocked(readCustomLyric);
const mockWriteCustom = jest.mocked(writeCustomLyric);
const mockWriteCache = jest.mocked(writeCachedLyric);
const mockWriteMiss = jest.mocked(writeCachedMiss);
const mockDeleteCustom = jest.mocked(deleteCustomLyric);
const mockPrune = jest.mocked(pruneLyricCache);

beforeEach(() => {
    mockReadCache.mockClear();
    mockReadCustom.mockClear();
    mockWriteCustom.mockClear();
    mockWriteCache.mockClear();
    mockWriteMiss.mockClear();
    mockDeleteCustom.mockClear();
    mockPrune.mockClear();
    mockReadCache.mockResolvedValue({ kind: 'absent' });
    mockReadCustom.mockResolvedValue(null);
    mockWriteCustom.mockResolvedValue(undefined);
    mockWriteCache.mockResolvedValue(undefined);
});

function music(id: string): MusicItem {
    return {
        platform: 'p',
        id,
        title: '',
        artist: '',
        album: '',
        artwork: '',
        duration: 0,
    };
}

/** 让 fire-and-forget 的取词 promise 链跑完 */
const flush = () => new Promise(resolve => setTimeout(resolve, 0));

interface Harness {
    setCurrent(item: MusicItem | null): void;
    emitProgress(position: number): void;
    setPosition(position: number): void;
    /** 预置某歌的歌词来源指定（模拟已关联 / 已编辑的数据） */
    seedOverride(item: MusicItem, value: LyricOverride): void;
    /** 读回某歌已落库的来源指定 */
    getStored(item: MusicItem): LyricOverride | undefined;
    associate(target: MusicItem, source: MusicItem): Promise<boolean>;
    reset(target: MusicItem): Promise<void>;
    getEffective(target: MusicItem): Promise<EffectiveLyric>;
    setCustom(target: MusicItem, text: LyricText | null): Promise<void>;
    setAutoSearch(enabled: boolean): void;
    /** 插件取词 spy：断言短路时未调用 */
    pluginGetLyric: jest.Mock;
    /** 来源写入 spy：断言失败时未落库 */
    setOverrideSpy: jest.Mock;
}

interface SearchSource {
    platform: string;
    search: jest.Mock;
    getLyric: jest.Mock;
}

interface HarnessOptions {
    autoSearch?: boolean;
    searchSources?: SearchSource[];
}

/** 用可控的 player / pluginManager mock 驱动一个 Lyric 实例 */
function makeHarness(
    getLyric: (item: MusicItem) => Promise<RawLyric | null>,
    supportsLyric = true,
    options: HarnessOptions = {},
): Harness {
    let currentCb: ((item: MusicItem | null) => void) | undefined;
    let progressCb: ((progress: Progress) => void) | undefined;
    let position = 0;

    const player = {
        subscribeCurrentMusic: (cb: (item: MusicItem | null) => void) => {
            currentCb = cb;
            cb(null);
            return () => {};
        },
        subscribeProgress: (cb: (progress: Progress) => void) => {
            progressCb = cb;
            return () => {};
        },
        getProgress: (): Progress => ({ position, duration: 0, buffered: 0 }),
    } as unknown as IPlayer;

    const pluginGetLyric = jest.fn(getLyric);
    const currentPlugin = {
        platform: 'p',
        supportedMethods: new Set(supportsLyric ? ['getLyric'] : []),
        methods: { getLyric: pluginGetLyric },
    } as unknown as Plugin;
    const searchPlugins = (options.searchSources ?? []).map(
        source =>
            ({
                platform: source.platform,
                supportedMethods: new Set(['search', 'getLyric']),
                methods: {
                    search: source.search,
                    getLyric: source.getLyric,
                },
            } as unknown as Plugin),
    );
    const pluginManager = {
        getByMediaItem: (item: MusicItem) =>
            item.platform === currentPlugin.platform
                ? currentPlugin
                : searchPlugins.find(p => p.platform === item.platform),
        getSearchablePlugins: () => searchPlugins,
    } as unknown as IPluginManager;

    // 按 mediaKey 索引的 side-table，忠实区分不同目标歌，便于验证写对目标
    const store = new Map<string, LyricOverride>();
    const setOverrideSpy = jest.fn((ref: MediaRef, value: LyricOverride) => {
        store.set(mediaKey(ref), value);
        return true;
    });
    const mediaMeta = {
        getLyricOffset: () => 0,
        setLyricOffset: () => {},
        getLyricOverride: (ref: MediaRef) => store.get(mediaKey(ref)),
        setLyricOverride: setOverrideSpy,
        clearLyricOverride: (ref: MediaRef) => {
            store.delete(mediaKey(ref));
        },
    } as unknown as IMediaMeta;

    let autoSearch = options.autoSearch ?? false;
    let configChanged: (() => void) | undefined;
    const config = {
        get: (key: string) =>
            key === 'lyric.autoSearchLyric' ? autoSearch : undefined,
        subscribe: (keys: readonly string[], cb: () => void) => {
            if (keys.includes('lyric.autoSearchLyric')) {
                configChanged = cb;
            }
            return () => undefined;
        },
    } as unknown as IConfig;
    const lyric = new Lyric({ config, player, pluginManager, mediaMeta });
    lyric.setup();

    return {
        setCurrent: item => {
            currentCb?.(item);
        },
        emitProgress: pos => {
            position = pos;
            progressCb?.({ position: pos, duration: 0, buffered: 0 });
        },
        setPosition: pos => {
            position = pos;
        },
        seedOverride: (item, value) => {
            store.set(mediaKey(item), value);
        },
        getStored: item => store.get(mediaKey(item)),
        associate: (target, source) => lyric.associateLyric(target, source),
        reset: target => lyric.resetLyric(target),
        getEffective: target => lyric.getEffectiveLyric(target),
        setCustom: (target, text) => lyric.setCustomLyric(target, text),
        setAutoSearch: enabled => {
            autoSearch = enabled;
            configChanged?.();
        },
        pluginGetLyric,
        setOverrideSpy,
    };
}

function searchableMusic(
    platform: string,
    id: string,
    title: string,
    artist: string,
): MusicItem {
    return { ...music(id), platform, title, artist };
}

describe('Lyric 管理器', () => {
    it('切歌后取词、解析并发布 loaded', async () => {
        const h = makeHarness(async () => ({
            rawLrc: '[00:01.00]a\n[00:03.00]b',
        }));
        h.setCurrent(music('1'));
        await flush();
        const state = atomStore.get(lyricAtom);
        expect(state.status).toBe('loaded');
        expect(state.lines.map(line => line.text)).toEqual(['a', 'b']);
    });

    it('无歌词时发布 unavailable', async () => {
        const h = makeHarness(async () => null);
        h.setCurrent(music('1'));
        await flush();
        expect(atomStore.get(lyricAtom).status).toBe('unavailable');
    });

    it('取词抛错时发布 unavailable', async () => {
        const h = makeHarness(() => Promise.reject(new Error('net')));
        h.setCurrent(music('1'));
        await flush();
        expect(atomStore.get(lyricAtom).status).toBe('unavailable');
    });

    it('指定了关联来源时取来源歌的词，而不是本歌的', async () => {
        const h = makeHarness(async item => ({
            rawLrc: item.id === 'x' ? '[00:01.00]assoc' : '[00:09.00]plugin',
        }));
        h.seedOverride(music('1'), {
            kind: 'associated',
            musicItem: music('x'),
        });
        h.setCurrent(music('1'));
        await flush();
        expect(atomStore.get(lyricAtom).lines.map(line => line.text)).toEqual([
            'assoc',
        ]);
        // 取词请求打给来源歌，不是当前歌
        expect(h.pluginGetLyric.mock.calls.at(-1)?.[0]?.id).toBe('x');
    });

    it('关联来源取不到词时不回落本歌插件，来源标注仍保留', async () => {
        // 来源插件被卸载 / 暂时取不到：用户要能看出「关联着但拉不到」，
        // 而不是悄悄换成本歌的词、显得从没关联过
        const h = makeHarness(async item =>
            item.id === 'x' ? null : { rawLrc: '[00:09.00]plugin' },
        );
        h.seedOverride(music('1'), {
            kind: 'associated',
            musicItem: music('x'),
        });
        h.setCurrent(music('1'));
        await flush();
        const state = atomStore.get(lyricAtom);
        expect(state.status).toBe('unavailable');
        expect(state.origin).toEqual({
            kind: 'associated',
            musicItem: music('x'),
        });
    });

    it('指定为自定义时用文件里的词，不请求插件', async () => {
        const h = makeHarness(async () => ({ rawLrc: '[00:09.00]plugin' }));
        mockReadCustom.mockResolvedValue({ rawLrc: '[00:01.00]mine' });
        h.seedOverride(music('1'), { kind: 'custom' });
        h.setCurrent(music('1'));
        await flush();
        const state = atomStore.get(lyricAtom);
        expect(state.lines.map(line => line.text)).toEqual(['mine']);
        expect(state.origin).toEqual({ kind: 'custom' });
        expect(h.pluginGetLyric).not.toHaveBeenCalled();
    });

    it('自定义词的文件丢了就当没指定过，回落本歌插件且来源标注变回 plugin', async () => {
        // 顶着「自定义」却一片空白只会让人困惑：没有可展示的来源，不如回到默认词
        const h = makeHarness(async () => ({ rawLrc: '[00:09.00]plugin' }));
        mockReadCustom.mockResolvedValue(null);
        h.seedOverride(music('1'), { kind: 'custom' });
        h.setCurrent(music('1'));
        await flush();
        const state = atomStore.get(lyricAtom);
        expect(state.lines.map(line => line.text)).toEqual(['plugin']);
        expect(state.origin).toEqual({ kind: 'plugin' });
    });

    it('取词迟迟不结算时，loading 态也带上已存的来源标注', async () => {
        // 关联曲的插件挂了可能永远不结算；此间 UI 若看到 origin=plugin，
        // 「恢复默认歌词」入口会一直藏着，这个失效的关联就解不掉了
        const h = makeHarness(() => new Promise<RawLyric>(() => {}));
        h.seedOverride(music('1'), {
            kind: 'associated',
            musicItem: music('x'),
        });
        h.setCurrent(music('1'));
        await flush();
        const state = atomStore.get(lyricAtom);
        expect(state.status).toBe('loading');
        expect(state.origin).toEqual({
            kind: 'associated',
            musicItem: music('x'),
        });
    });

    it('associateLyric 关联当前歌后用选中项的权威歌词重渲染', async () => {
        const h = makeHarness(async item => ({
            rawLrc:
                item.id === '2' ? '[00:02.00]associated' : '[00:09.00]initial',
        }));
        h.setCurrent(music('1'));
        await flush();
        expect(atomStore.get(lyricAtom).lines.map(line => line.text)).toEqual([
            'initial',
        ]);
        const ok = await h.associate(music('1'), music('2'));
        expect(ok).toBe(true);
        await flush();
        expect(atomStore.get(lyricAtom).lines.map(line => line.text)).toEqual([
            'associated',
        ]);
        expect(h.getStored(music('1'))).toEqual({
            kind: 'associated',
            musicItem: music('2'),
        });
    });

    it('associateLyric 关联非当前歌时只持久化、不动当前歌词', async () => {
        const h = makeHarness(async item => ({
            rawLrc:
                item.id === '9src' ? '[00:02.00]other' : '[00:09.00]current',
        }));
        h.setCurrent(music('1'));
        await flush();
        const ok = await h.associate(music('9'), music('9src'));
        expect(ok).toBe(true);
        await flush();
        expect(h.getStored(music('9'))).toEqual({
            kind: 'associated',
            musicItem: music('9src'),
        });
        expect(atomStore.get(lyricAtom).lines.map(line => line.text)).toEqual([
            'current',
        ]);
    });

    it('associateLyric 取不到可显示正文时返回 false 且不写入', async () => {
        const h = makeHarness(async () => null);
        h.setCurrent(music('1'));
        await flush();
        const ok = await h.associate(music('1'), music('2'));
        expect(ok).toBe(false);
        expect(h.setOverrideSpy).not.toHaveBeenCalled();
        expect(atomStore.get(lyricAtom).status).toBe('unavailable');
    });

    it('associateLyric 拒绝把歌关联到自身', async () => {
        const h = makeHarness(async () => ({ rawLrc: '[00:01.00]x' }));
        h.setCurrent(music('1'));
        await flush();
        const ok = await h.associate(music('1'), music('1'));
        expect(ok).toBe(false);
        expect(h.setOverrideSpy).not.toHaveBeenCalled();
    });

    it('关联会删掉这首歌已有的自定义词：两种来源互斥，留着就是取不到的孤儿', async () => {
        const h = makeHarness(async () => ({ rawLrc: '[00:01.00]x' }));
        h.setCurrent(music('1'));
        await flush();

        await h.associate(music('1'), music('2'));

        expect(mockDeleteCustom).toHaveBeenCalledTimes(1);
    });

    it('关联词生效时 origin 带来源歌，插件词生效时是 plugin', async () => {
        const withAssoc = makeHarness(async () => ({
            rawLrc: '[00:01.00]a',
        }));
        withAssoc.seedOverride(music('1'), {
            kind: 'associated',
            musicItem: music('src'),
        });
        withAssoc.setCurrent(music('1'));
        await flush();
        expect(atomStore.get(lyricAtom).origin).toEqual({
            kind: 'associated',
            musicItem: music('src'),
        });

        const pluginOnly = makeHarness(async () => ({
            rawLrc: '[00:09.00]plugin',
        }));
        pluginOnly.setCurrent(music('2'));
        await flush();
        expect(atomStore.get(lyricAtom).origin).toEqual({ kind: 'plugin' });
    });

    it('resetLyric 清掉当前歌的来源指定后回落插件词', async () => {
        const h = makeHarness(async item => ({
            rawLrc: item.id === 'src' ? '[00:01.00]assoc' : '[00:09.00]plugin',
        }));
        h.seedOverride(music('1'), {
            kind: 'associated',
            musicItem: music('src'),
        });
        h.setCurrent(music('1'));
        await flush();
        expect(atomStore.get(lyricAtom).lines.map(line => line.text)).toEqual([
            'assoc',
        ]);
        await h.reset(music('1'));
        await flush();
        expect(atomStore.get(lyricAtom).lines.map(line => line.text)).toEqual([
            'plugin',
        ]);
        expect(h.getStored(music('1'))).toBeUndefined();
        expect(atomStore.get(lyricAtom).origin).toEqual({ kind: 'plugin' });
        // 关联与自定义一并清
        expect(mockDeleteCustom).toHaveBeenCalled();
    });

    it('解除关联的异步回退期间进度事件不残留旧当前行', async () => {
        let resolvePlugin!: (v: RawLyric) => void;
        const h = makeHarness(item =>
            item.id === 'src'
                ? Promise.resolve<RawLyric>({
                      rawLrc: '[00:01.00]old\n[00:05.00]old2',
                  })
                : new Promise<RawLyric>(r => {
                      resolvePlugin = r;
                  }),
        );
        h.seedOverride(music('1'), {
            kind: 'associated',
            musicItem: music('src'),
        });
        h.setCurrent(music('1'));
        await flush();
        h.emitProgress(1);
        expect(atomStore.get(currentLineAtom).line?.text).toBe('old');
        // 恢复默认：清除 + 回落插件取词（pending）；间隙来进度事件不应再用旧时间轴发布当前行
        const pending = h.reset(music('1'));
        h.emitProgress(5);
        expect(atomStore.get(currentLineAtom)).toEqual({
            index: -1,
            line: null,
        });
        // 取词要先过一次文件缓存查询，插件调用发生在那之后；不等这一跳 resolvePlugin 还没赋值
        await flush();
        resolvePlugin({ rawLrc: '[00:20.00]new' });
        await pending;
        await flush();
    });

    it('恢复默认后重取用 player 当前对象而非传入的 target 快照', async () => {
        const h = makeHarness(async () => ({ rawLrc: '[00:01.00]x' }));
        const current = { ...music('1'), title: 'CURRENT' };
        h.seedOverride(current, {
            kind: 'associated',
            musicItem: music('src'),
        });
        h.setCurrent(current);
        await flush();
        h.pluginGetLyric.mockClear();
        // 传入同身份（platform+id）但不同实例/字段的快照
        await h.reset({ ...music('1'), title: 'STALE' });
        await flush();
        expect(h.pluginGetLyric).toHaveBeenCalled();
        expect(h.pluginGetLyric.mock.calls.at(-1)?.[0]?.title).toBe('CURRENT');
    });

    it('同身份补全信息后恢复默认，重取用最新的当前对象', async () => {
        const h = makeHarness(async () => ({ rawLrc: '[00:01.00]x' }));
        const thin = { ...music('1'), title: 'THIN' };
        h.seedOverride(thin, {
            kind: 'associated',
            musicItem: music('src'),
        });
        h.setCurrent(thin);
        await flush();
        // player 补全信息后再次发布同身份对象（同 platform+id、字段更全）
        h.setCurrent({ ...music('1'), title: 'ENRICHED' });
        await flush();
        h.pluginGetLyric.mockClear();
        await h.reset(music('1'));
        await flush();
        // 重取应用补全后的最新对象、而非最初的薄快照
        expect(h.pluginGetLyric.mock.calls.at(-1)?.[0]?.title).toBe('ENRICHED');
    });

    it('切歌为 null 时清空歌词与当前行', async () => {
        const h = makeHarness(async () => ({ rawLrc: '[00:01.00]a' }));
        h.setCurrent(music('1'));
        await flush();
        h.setCurrent(null);
        expect(atomStore.get(lyricAtom).status).toBe('unavailable');
        expect(atomStore.get(currentLineAtom)).toEqual({
            index: -1,
            line: null,
        });
    });

    it('快速切歌时过期取词结果被丢弃', async () => {
        const h = makeHarness(item =>
            item.id === 'A'
                ? new Promise<RawLyric | null>(resolve =>
                      setTimeout(
                          () => resolve({ rawLrc: '[00:01.00]aaa' }),
                          20,
                      ),
                  )
                : Promise.resolve({ rawLrc: '[00:01.00]bbb' }),
        );
        h.setCurrent(music('A'));
        h.setCurrent(music('B'));
        await new Promise(resolve => setTimeout(resolve, 40));
        expect(atomStore.get(lyricAtom).lines.map(line => line.text)).toEqual([
            'bbb',
        ]);
    });

    it('进度推进时更新当前行', async () => {
        const h = makeHarness(async () => ({
            rawLrc: '[00:01.00]a\n[00:03.00]b\n[00:05.00]c',
        }));
        h.setCurrent(music('1'));
        await flush();
        h.emitProgress(4);
        expect(atomStore.get(currentLineAtom).index).toBe(1);
    });

    it('加载后用当前位置立刻定位当前行（不等进度推送）', async () => {
        const h = makeHarness(async () => ({
            rawLrc: '[00:01.00]a\n[00:03.00]b\n[00:05.00]c',
        }));
        h.setPosition(4);
        h.setCurrent(music('1'));
        await flush();
        expect(atomStore.get(currentLineAtom).index).toBe(1);
    });

    it('脏插件结果（非字符串）不卡 loading，落到 unavailable', async () => {
        const h = makeHarness(
            async () => ({ rawLrc: 42 } as unknown as RawLyric),
        );
        h.setCurrent(music('1'));
        await flush();
        expect(atomStore.get(lyricAtom).status).toBe('unavailable');
    });

    it('纯文本歌词加载后不高亮任何行', async () => {
        const h = makeHarness(async () => ({ rawLrc: '第一行\n第二行' }));
        h.setPosition(10);
        h.setCurrent(music('1'));
        await flush();
        expect(atomStore.get(lyricAtom).status).toBe('loaded');
        expect(atomStore.get(currentLineAtom).index).toBe(-1);
    });

    it('单曲循环同曲重触发时保留歌词、不重复取词', async () => {
        const getLyric = jest.fn(async () => ({ rawLrc: '[00:01.00]a' }));
        const h = makeHarness(getLyric);
        h.setCurrent(music('1'));
        await flush();
        h.setCurrent(music('1'));
        await flush();
        expect(getLyric).toHaveBeenCalledTimes(1);
        expect(atomStore.get(lyricAtom).status).toBe('loaded');
    });

    it('插件不支持取词时发布 unavailable、不调 getLyric', async () => {
        const getLyric = jest.fn(async () => ({ rawLrc: '[00:01.00]a' }));
        const h = makeHarness(getLyric, false);
        h.setCurrent(music('1'));
        await flush();
        expect(getLyric).not.toHaveBeenCalled();
        expect(atomStore.get(lyricAtom).status).toBe('unavailable');
    });
});

describe('歌词自动搜索', () => {
    const target = searchableMusic('p', 'target', '同一首歌', '目标歌手');

    it('开关关闭或本源已有歌词时不搜索其它源', async () => {
        const search = jest.fn(async () => ({ data: [] }));
        const source = {
            platform: 'foreign',
            search,
            getLyric: jest.fn(async () => ({ rawLrc: '[00:01.00]foreign' })),
        };
        const off = makeHarness(async () => null, true, {
            searchSources: [source],
        });
        off.setCurrent(target);
        await flush();
        expect(search).not.toHaveBeenCalled();

        const direct = makeHarness(
            async () => ({ rawLrc: '[00:01.00]direct' }),
            true,
            { autoSearch: true, searchSources: [source] },
        );
        direct.setCurrent(target);
        await flush();
        expect(search).not.toHaveBeenCalled();
        expect(atomStore.get(lyricAtom).lines[0]?.text).toBe('direct');
    });

    it('按源顺序继续尝试，拒绝错歌并在同标题候选中用歌手择优', async () => {
        const wrongSearch = jest.fn(async () => ({
            data: [searchableMusic('wrong', 'wrong', '完全不同', '目标歌手')],
        }));
        const goodSearch = jest.fn(async () => ({
            data: [
                searchableMusic('good', 'other-artist', '同一首歌', '别人'),
                searchableMusic('good', 'match', '同一首歌', '目标歌手'),
            ],
        }));
        const goodGetLyric = jest.fn(async (item: MusicItem) => ({
            rawLrc: `[00:01.00]${item.id}`,
        }));
        const h = makeHarness(async () => null, true, {
            autoSearch: true,
            searchSources: [
                {
                    platform: 'wrong',
                    search: wrongSearch,
                    getLyric: jest.fn(),
                },
                {
                    platform: 'good',
                    search: goodSearch,
                    getLyric: goodGetLyric,
                },
            ],
        });

        h.setCurrent(target);
        await flush();

        expect(wrongSearch).toHaveBeenCalledWith('同一首歌', 1, 'lyric');
        expect(goodSearch).toHaveBeenCalled();
        expect(goodGetLyric.mock.calls[0]?.[0]?.id).toBe('match');
        expect(atomStore.get(lyricAtom).lines[0]?.text).toBe('match');
        expect(mockWriteCache).toHaveBeenCalledWith(
            expect.objectContaining({ platform: 'good', id: 'match' }),
            { rawLrc: '[00:01.00]match' },
        );
        expect(h.getStored(target)).toBeUndefined();
    });

    it('alias 只有空白时查询与匹配都回落标题', async () => {
        const search = jest.fn(async () => ({
            data: [searchableMusic('foreign', 'match', '同一首歌', '目标歌手')],
        }));
        const h = makeHarness(async () => null, true, {
            autoSearch: true,
            searchSources: [
                {
                    platform: 'foreign',
                    search,
                    getLyric: jest.fn(async () => ({
                        rawLrc: '[00:01.00]matched',
                    })),
                },
            ],
        });

        h.setCurrent({ ...target, alias: '   ' });
        await flush();

        expect(search).toHaveBeenCalledWith('同一首歌', 1, 'lyric');
        expect(atomStore.get(lyricAtom).lines[0]?.text).toBe('matched');
    });

    it('自动搜索期间同一歌曲补全歌手时，旧搜索失效并按最新快照重试', async () => {
        let resolveFirst!: (value: { data: MusicItem[] }) => void;
        const getForeignLyric = jest.fn(async (item: MusicItem) => ({
            rawLrc: `[00:01.00]${item.id}`,
        }));
        const search = jest
            .fn()
            .mockImplementationOnce(
                () =>
                    new Promise<{ data: MusicItem[] }>(resolve => {
                        resolveFirst = resolve;
                    }),
            )
            .mockResolvedValue({
                data: [
                    searchableMusic('foreign', 'match', '同一首歌', '目标歌手'),
                ],
            });
        const h = makeHarness(async () => null, true, {
            autoSearch: true,
            searchSources: [
                {
                    platform: 'foreign',
                    search,
                    getLyric: getForeignLyric,
                },
            ],
        });

        h.setCurrent({ ...target, artist: '' });
        await flush();
        expect(search).toHaveBeenCalledTimes(1);

        h.setCurrent(target);
        await flush();
        expect(search).toHaveBeenCalledTimes(2);

        resolveFirst({
            data: [searchableMusic('foreign', 'wrong', '同一首歌', '别人')],
        });
        await flush();

        expect(atomStore.get(lyricAtom).lines[0]?.text).toBe('match');
        expect(getForeignLyric).toHaveBeenCalledTimes(1);
        expect(getForeignLyric.mock.calls[0]?.[0]?.id).toBe('match');
    });

    it('上一首本源取词迟到，不覆盖当前曲的自动搜索代次', async () => {
        let resolvePrevious!: (value: RawLyric | null) => void;
        let resolveFirstSearch!: (value: { data: MusicItem[] }) => void;
        const getForeignLyric = jest.fn(async (item: MusicItem) => ({
            rawLrc: `[00:01.00]${item.id}`,
        }));
        const search = jest
            .fn()
            .mockImplementationOnce(
                () =>
                    new Promise<{ data: MusicItem[] }>(resolve => {
                        resolveFirstSearch = resolve;
                    }),
            )
            .mockResolvedValue({
                data: [
                    searchableMusic('foreign', 'match', '同一首歌', '目标歌手'),
                ],
            });
        const h = makeHarness(
            item =>
                item.id === 'previous'
                    ? new Promise<RawLyric | null>(resolve => {
                          resolvePrevious = resolve;
                      })
                    : Promise.resolve(null),
            true,
            {
                autoSearch: true,
                searchSources: [
                    {
                        platform: 'foreign',
                        search,
                        getLyric: getForeignLyric,
                    },
                ],
            },
        );

        h.setCurrent(searchableMusic('p', 'previous', '上一首', '上一位歌手'));
        await flush();
        h.setCurrent({ ...target, artist: '' });
        await flush();
        expect(search).toHaveBeenCalledTimes(1);

        // 上一首此时才返回空；它不能清掉当前曲正在使用的自动搜索代次
        resolvePrevious(null);
        await flush();
        h.setCurrent(target);
        await flush();
        expect(search).toHaveBeenCalledTimes(2);

        resolveFirstSearch({
            data: [searchableMusic('foreign', 'stale', '同一首歌', '别人')],
        });
        await flush();

        expect(atomStore.get(lyricAtom).lines[0]?.text).toBe('match');
        expect(getForeignLyric).toHaveBeenCalledTimes(1);
        expect(getForeignLyric.mock.calls[0]?.[0]?.id).toBe('match');
    });

    it('超长标题只接受完整相等，不把相同前缀的不同歌曲当成匹配', async () => {
        const prefix = 'a'.repeat(300);
        const search = jest.fn(async () => ({
            data: [
                searchableMusic('foreign', 'wrong', `${prefix}x`, '目标歌手'),
            ],
        }));
        const h = makeHarness(async () => null, true, {
            autoSearch: true,
            searchSources: [
                {
                    platform: 'foreign',
                    search,
                    getLyric: jest.fn(async () => ({
                        rawLrc: '[00:01.00]wrong',
                    })),
                },
            ],
        });

        h.setCurrent({ ...target, title: `${prefix}y` });
        await flush();

        expect(atomStore.get(lyricAtom).status).toBe('unavailable');
    });

    it('手动关联失败时不自动换源', async () => {
        const search = jest.fn(async () => ({ data: [] }));
        const h = makeHarness(async () => null, true, {
            autoSearch: true,
            searchSources: [
                { platform: 'foreign', search, getLyric: jest.fn() },
            ],
        });
        h.seedOverride(target, {
            kind: 'associated',
            musicItem: searchableMusic(
                'p',
                'associated',
                '同一首歌',
                '目标歌手',
            ),
        });

        h.setCurrent(target);
        await flush();

        expect(search).not.toHaveBeenCalled();
        expect(atomStore.get(lyricAtom).origin.kind).toBe('associated');
    });

    it('编辑非当前歌曲只读原来源，不触发自动搜索', async () => {
        const search = jest.fn(async () => ({ data: [] }));
        const h = makeHarness(async () => null, true, {
            autoSearch: true,
            searchSources: [
                { platform: 'foreign', search, getLyric: jest.fn() },
            ],
        });

        await h.getEffective(target);

        expect(search).not.toHaveBeenCalled();
    });

    it('开启开关会重载当前无词歌曲；搜索中关闭则迟到结果不生效', async () => {
        let resolveSearch!: (value: { data: MusicItem[] }) => void;
        const search = jest.fn(
            () =>
                new Promise<{ data: MusicItem[] }>(resolve => {
                    resolveSearch = resolve;
                }),
        );
        const h = makeHarness(async () => null, true, {
            searchSources: [
                {
                    platform: 'foreign',
                    search,
                    getLyric: jest.fn(async () => ({
                        rawLrc: '[00:01.00]late',
                    })),
                },
            ],
        });
        h.setCurrent(target);
        await flush();
        expect(atomStore.get(lyricAtom).status).toBe('unavailable');

        h.setAutoSearch(true);
        await flush();
        expect(search).toHaveBeenCalledTimes(1);

        h.setAutoSearch(false);
        await flush();
        resolveSearch({
            data: [searchableMusic('foreign', 'match', '同一首歌', '目标歌手')],
        });
        await flush();

        expect(atomStore.get(lyricAtom).status).toBe('unavailable');
        expect(atomStore.get(lyricAtom).lines).toEqual([]);
    });
});

describe('编辑器读写', () => {
    it('getEffectiveLyric 读回当前生效的自定义词与来源', async () => {
        const h = makeHarness(async () => ({ rawLrc: '[00:09.00]plugin' }));
        mockReadCustom.mockResolvedValue({
            rawLrc: '[00:01.00]mine',
            translation: 'trans',
        });
        h.seedOverride(music('1'), { kind: 'custom' });

        const effective = await h.getEffective(music('1'));

        expect(effective).toEqual({
            text: { rawLrc: '[00:01.00]mine', translation: 'trans' },
            origin: { kind: 'custom' },
        });
        expect(h.pluginGetLyric).not.toHaveBeenCalled();
    });

    it('getEffectiveLyric 无来源指定时回落插件词，且不必是当前播放歌', async () => {
        const h = makeHarness(async () => ({ rawLrc: '[00:01.00]plugin' }));

        const effective = await h.getEffective(music('9'));

        expect(effective).toEqual({
            text: { rawLrc: '[00:01.00]plugin' },
            origin: { kind: 'plugin' },
        });
    });

    it('setCustomLyric 先写文件再写标记，覆盖已有的关联', async () => {
        const h = makeHarness(async () => ({ rawLrc: '[00:09.00]plugin' }));
        h.seedOverride(music('1'), {
            kind: 'associated',
            musicItem: music('src'),
        });

        await h.setCustom(music('1'), {
            rawLrc: '[00:01.00]mine',
            translation: 'trans',
        });

        expect(mockWriteCustom).toHaveBeenCalledWith(music('1'), {
            rawLrc: '[00:01.00]mine',
            translation: 'trans',
        });
        expect(h.getStored(music('1'))).toEqual({ kind: 'custom' });
        // 顺序不能反：标记先落地会指向一个还不存在的文件
        expect(mockWriteCustom.mock.invocationCallOrder[0]).toBeLessThan(
            h.setOverrideSpy.mock.invocationCallOrder[0] ?? 0,
        );
    });

    it('setCustomLyric 保存当前播放歌时立即重渲染', async () => {
        const h = makeHarness(async () => ({ rawLrc: '[00:09.00]plugin' }));
        h.setCurrent(music('1'));
        await flush();
        expect(atomStore.get(lyricAtom).lines.map(l => l.text)).toEqual([
            'plugin',
        ]);
        // 重取会读回刚写下的自定义词
        mockReadCustom.mockResolvedValue({ rawLrc: '[00:02.00]mine' });

        await h.setCustom(music('1'), { rawLrc: '[00:02.00]mine' });
        await flush();

        const state = atomStore.get(lyricAtom);
        expect(state.lines.map(l => l.text)).toEqual(['mine']);
        expect(state.origin).toEqual({ kind: 'custom' });
    });

    it('setCustomLyric 正文空白等同恢复默认：清标记、删文件、不写文件', async () => {
        const h = makeHarness(async () => ({ rawLrc: '[00:09.00]plugin' }));
        h.seedOverride(music('1'), { kind: 'custom' });

        await h.setCustom(music('1'), { rawLrc: '   \n  ' });

        expect(mockWriteCustom).not.toHaveBeenCalled();
        expect(mockDeleteCustom).toHaveBeenCalledWith(music('1'));
        expect(h.getStored(music('1'))).toBeUndefined();
    });

    it('setCustomLyric 空白译文不落库，避免存下一个空字段', async () => {
        const h = makeHarness(async () => ({ rawLrc: '[00:09.00]plugin' }));

        await h.setCustom(music('1'), {
            rawLrc: '[00:01.00]mine',
            translation: '  ',
        });

        expect(mockWriteCustom).toHaveBeenCalledWith(music('1'), {
            rawLrc: '[00:01.00]mine',
        });
    });

    it('setCustomLyric 削掉尾部空白但保留行首缩进', async () => {
        const h = makeHarness(async () => ({ rawLrc: '[00:09.00]plugin' }));

        await h.setCustom(music('1'), {
            rawLrc: '  [00:01.00]mine\n\n  \n',
            translation: '  译文\n\n',
        });

        expect(mockWriteCustom).toHaveBeenCalledWith(music('1'), {
            rawLrc: '  [00:01.00]mine',
            translation: '  译文',
        });
    });

    it('setCustomLyric 超长文本按上限截断，且不劈裂代理对', async () => {
        const h = makeHarness(async () => ({ rawLrc: '[00:09.00]plugin' }));
        // 上限恰好落在 emoji 的两个码元之间：整个字符一并回退，不能留半个
        const overflowing = `${'a'.repeat(LYRIC_MAX_LENGTH - 1)}😀`;

        await h.setCustom(music('1'), { rawLrc: overflowing });

        const written = mockWriteCustom.mock.calls[0]?.[1];
        expect(written?.rawLrc).toHaveLength(LYRIC_MAX_LENGTH - 1);
        expect(/[\uD800-\uDFFF]/.test(written?.rawLrc ?? '')).toBe(false);
    });

    it('setCustomLyric 正文与译文各自独立封顶', async () => {
        const h = makeHarness(async () => ({ rawLrc: '[00:09.00]plugin' }));
        const overflowing = `${'b'.repeat(LYRIC_MAX_LENGTH - 1)}😀`;

        await h.setCustom(music('1'), {
            rawLrc: '[00:01.00]mine',
            translation: overflowing,
        });

        const written = mockWriteCustom.mock.calls[0]?.[1];
        // 正文没超限 → 原样保留；译文各算各的，同样代理对安全
        expect(written?.rawLrc).toBe('[00:01.00]mine');
        expect(written?.translation).toHaveLength(LYRIC_MAX_LENGTH - 1);
        expect(/[\uD800-\uDFFF]/.test(written?.translation ?? '')).toBe(false);
    });

    it('setCustomLyric 写盘失败时抛出，且不写标记', async () => {
        const h = makeHarness(async () => ({ rawLrc: '[00:09.00]plugin' }));
        mockWriteCustom.mockRejectedValue(new Error('disk'));

        await expect(
            h.setCustom(music('1'), { rawLrc: '[00:01.00]mine' }),
        ).rejects.toThrow('disk');
        expect(h.getStored(music('1'))).toBeUndefined();
    });

    it('setCustomLyric 标记写不进去时抛出，不留「保存成功」的假象', async () => {
        const h = makeHarness(async () => ({ rawLrc: '[00:09.00]plugin' }));
        h.setOverrideSpy.mockReturnValue(false);

        await expect(
            h.setCustom(music('1'), { rawLrc: '[00:01.00]mine' }),
        ).rejects.toThrow();
    });
});

describe('歌词文件缓存', () => {
    it('命中缓存直接用，不再请求插件', async () => {
        mockReadCache.mockResolvedValue({
            kind: 'hit',
            text: { rawLrc: '[00:01.00]cached' },
        });
        const h = makeHarness(async () => ({ rawLrc: '[00:01.00]fresh' }));

        h.setCurrent(music('1'));
        await flush();

        expect(h.pluginGetLyric).not.toHaveBeenCalled();
        expect(atomStore.get(lyricAtom).lines.map(l => l.text)).toEqual([
            'cached',
        ]);
    });

    it('负缓存未过期时直接判无词，不请求插件', async () => {
        mockReadCache.mockResolvedValue({ kind: 'none' });
        const h = makeHarness(async () => ({ rawLrc: '[00:01.00]fresh' }));

        h.setCurrent(music('1'));
        await flush();

        expect(h.pluginGetLyric).not.toHaveBeenCalled();
        expect(atomStore.get(lyricAtom).status).toBe('unavailable');
    });

    it('未缓存时请求插件并把结果写入缓存', async () => {
        const h = makeHarness(async () => ({
            rawLrc: '[00:01.00]a',
            translation: '[00:01.00]甲',
        }));

        h.setCurrent(music('1'));
        await flush();

        expect(h.pluginGetLyric).toHaveBeenCalledTimes(1);
        expect(mockWriteCache).toHaveBeenCalledTimes(1);
        expect(mockWriteCache.mock.calls[0]?.[1]).toEqual({
            rawLrc: '[00:01.00]a',
            translation: '[00:01.00]甲',
        });
    });

    it('写缓存失败不连累这次取词：词已经拿到了', async () => {
        mockWriteCache.mockRejectedValue(new Error('disk full'));
        const h = makeHarness(async () => ({ rawLrc: '[00:01.00]a' }));

        h.setCurrent(music('1'));
        await flush();

        expect(atomStore.get(lyricAtom).status).toBe('loaded');
    });

    // —— 负缓存的四种判据：只有「插件明确返回空」才记 ——

    it('插件返回空 → 记负缓存', async () => {
        const h = makeHarness(async () => null);

        h.setCurrent(music('1'));
        await flush();

        expect(mockWriteMiss).toHaveBeenCalledTimes(1);
    });

    it('插件返回的词解析不出行（只有标签 / 空白）→ 记负缓存', async () => {
        const h = makeHarness(async () => ({ rawLrc: '[ti:标题]\n   \n' }));

        h.setCurrent(music('1'));
        await flush();

        expect(mockWriteMiss).toHaveBeenCalledTimes(1);
    });

    it('getLyric 抛错 → 不记负缓存：网络抖动是暂时的，不能变成一整天没词', async () => {
        const h = makeHarness(async () => {
            throw new Error('network');
        });

        h.setCurrent(music('1'));
        await flush();

        expect(mockWriteMiss).not.toHaveBeenCalled();
        expect(atomStore.get(lyricAtom).status).toBe('unavailable');
    });

    it('插件不支持取词 → 不记负缓存：换个插件就有了', async () => {
        const h = makeHarness(async () => ({ rawLrc: '[00:01.00]a' }), false);

        h.setCurrent(music('1'));
        await flush();

        expect(mockWriteMiss).not.toHaveBeenCalled();
    });

    it('启动时淘汰一次超量缓存', () => {
        makeHarness(async () => null);

        expect(mockPrune).toHaveBeenCalledTimes(1);
    });

    it('取词期间切歌 → 丢弃过期结果（文件 I/O 让这个窗口更长）', async () => {
        let resolveRead!: (v: { kind: 'absent' }) => void;
        mockReadCache.mockImplementationOnce(
            () =>
                new Promise(r => {
                    resolveRead = r;
                }),
        );
        const h = makeHarness(async item => ({
            rawLrc: `[00:01.00]${item.id}`,
        }));

        h.setCurrent(music('1'));
        await flush();
        // 第一首还卡在读缓存，此时切到第二首
        h.setCurrent(music('2'));
        await flush();
        resolveRead({ kind: 'absent' });
        await flush();

        expect(atomStore.get(lyricAtom).lines.map(l => l.text)).toEqual(['2']);
    });
});
