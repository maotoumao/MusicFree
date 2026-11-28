import {
    decodeLegacyStarred,
    decodeLegacySummary,
    decodePlaylistMusic,
    importLegacyIntoV1,
    LEGACY_INDEX_STORE_ID,
    LEGACY_META_STORE_ID,
    LEGACY_STARRED_STORE_ID,
    legacyPlaylistStoreId,
    sortWireToMode,
} from './legacyImport';
import {
    PLAYLIST_INDEX_STORE_ID,
    STARRED_STORE_ID,
    playlistStoreId,
    readIndex,
    readMusic,
    readSortMode,
    readStarred,
    writeIndex,
    writeStarred,
} from './storage';
import { PlaylistMusicSortMode } from './types';

import type { LegacyImportDeps } from './legacyImport';

const FALLBACK = 1_700_000_000_000;

/** 构造一条 legacy 曲目 raw（可覆盖字段） */
function musicRaw(overrides: Record<string, unknown>): Record<string, unknown> {
    return {
        platform: '示例源',
        id: 'm1',
        title: '歌',
        artist: '手',
        album: '碟',
        artwork: 'https://example.invalid/a.jpg',
        duration: 100,
        ...overrides,
    };
}

/** Map 支撑的读写 store，用于 wire 往返 */
function fakeStore() {
    const map = new Map<string, string>();
    return {
        getString: (key: string) => map.get(key),
        set: (key: string, value: string) => {
            map.set(key, value);
        },
        remove: (key: string) => {
            map.delete(key);
        },
    };
}

describe('decodePlaylistMusic', () => {
    it('映射 $timestamp/$sortIndex 为 addedAt/batchRank 并从 item 剥离', () => {
        const entries = decodePlaylistMusic(
            [musicRaw({ id: 'a', $timestamp: 1710000000000, $sortIndex: 2 })],
            FALLBACK,
        );
        expect(entries).toHaveLength(1);
        expect(entries[0]!.addedAt).toBe(1710000000000);
        expect(entries[0]!.batchRank).toBe(2);
        expect('$timestamp' in entries[0]!.item).toBe(false);
        expect('$sortIndex' in entries[0]!.item).toBe(false);
    });

    it('数字 id 规范化为字符串', () => {
        const entries = decodePlaylistMusic(
            [musicRaw({ id: 123, $timestamp: 1, $sortIndex: 1 })],
            FALLBACK,
        );
        expect(entries[0]!.item.id).toBe('123');
    });

    it('缺 wire 字段时兜底 addedAt=fallback、batchRank=数组下标', () => {
        const entries = decodePlaylistMusic(
            [musicRaw({ id: 'a' }), musicRaw({ id: 'b' })],
            FALLBACK,
        );
        expect(entries.map(e => [e.item.id, e.addedAt, e.batchRank])).toEqual([
            ['a', FALLBACK, 0],
            ['b', FALLBACK, 1],
        ]);
    });

    it('缺字段兜底的 batchRank 用原数组下标（坏项占位不影响后续下标）', () => {
        const entries = decodePlaylistMusic(
            [{ title: '坏' }, musicRaw({ id: 'a' }), musicRaw({ id: 'b' })],
            FALLBACK,
        );
        expect(entries.map(e => [e.item.id, e.batchRank])).toEqual([
            ['a', 1],
            ['b', 2],
        ]);
    });

    it('丢弃无 platform+id 的坏项', () => {
        const entries = decodePlaylistMusic(
            [
                { title: '缺主键' },
                musicRaw({ id: 'ok', $timestamp: 1, $sortIndex: 1 }),
                { platform: '', id: 'x' },
            ],
            FALLBACK,
        );
        expect(entries.map(e => e.item.id)).toEqual(['ok']);
    });

    it('同 platform+id 去重、保留第一条', () => {
        const entries = decodePlaylistMusic(
            [
                musicRaw({
                    id: 'dup',
                    title: '第一',
                    $timestamp: 1,
                    $sortIndex: 2,
                }),
                musicRaw({
                    id: 'dup',
                    title: '第二',
                    $timestamp: 1,
                    $sortIndex: 1,
                }),
            ],
            FALLBACK,
        );
        expect(entries).toHaveLength(1);
        expect(entries[0]!.item.title).toBe('第一');
    });

    it('保留插件未知扩展字段', () => {
        const entries = decodePlaylistMusic(
            [
                musicRaw({
                    id: 'a',
                    $timestamp: 1,
                    $sortIndex: 1,
                    pluginToken: 'xyz',
                }),
            ],
            FALLBACK,
        );
        expect((entries[0]!.item as Record<string, unknown>).pluginToken).toBe(
            'xyz',
        );
    });

    it('非数组输入返回空', () => {
        expect(decodePlaylistMusic(null, FALLBACK)).toEqual([]);
        expect(decodePlaylistMusic({}, FALLBACK)).toEqual([]);
    });

    it('不 mutate 输入 DTO（$timestamp/$sortIndex 仍在原对象上）', () => {
        const input = musicRaw({ id: 'a', $timestamp: 5, $sortIndex: 3 });
        decodePlaylistMusic([input], FALLBACK);
        expect(input.$timestamp).toBe(5);
        expect(input.$sortIndex).toBe(3);
    });

    it('$sortIndex=0 视为有效（legacy migrateV2 首项）', () => {
        const entries = decodePlaylistMusic(
            [musicRaw({ id: 'a', $timestamp: 1710000000000, $sortIndex: 0 })],
            FALLBACK,
        );
        expect(entries[0]!.addedAt).toBe(1710000000000);
        expect(entries[0]!.batchRank).toBe(0);
    });

    it('只有单个 wire 字段时整对回填', () => {
        const entries = decodePlaylistMusic(
            [
                musicRaw({ id: 'a', $timestamp: 1710000000000 }),
                musicRaw({ id: 'b', $sortIndex: 5 }),
            ],
            FALLBACK,
        );
        expect(entries.map(e => [e.addedAt, e.batchRank])).toEqual([
            [FALLBACK, 0],
            [FALLBACK, 1],
        ]);
    });

    it('数字 id 与等值字符串 id 规范化后去重、保留第一条', () => {
        const entries = decodePlaylistMusic(
            [
                musicRaw({
                    id: 123,
                    title: '第一',
                    $timestamp: 1,
                    $sortIndex: 2,
                }),
                musicRaw({
                    id: '123',
                    title: '第二',
                    $timestamp: 1,
                    $sortIndex: 1,
                }),
            ],
            FALLBACK,
        );
        expect(entries).toHaveLength(1);
        expect(entries[0]!.item.id).toBe('123');
        expect(entries[0]!.item.title).toBe('第一');
    });

    it('数字 id 路径也不 mutate 输入', () => {
        const input = musicRaw({ id: 123, $timestamp: 5, $sortIndex: 3 });
        decodePlaylistMusic([input], FALLBACK);
        expect(input.id).toBe(123);
        expect(input.$timestamp).toBe(5);
        expect(input.$sortIndex).toBe(3);
    });

    it('保留 own __proto__ 字段且不污染原型', () => {
        const raw = JSON.parse(
            '{"platform":"示例源","id":"a","title":"歌","artist":"手","album":"磟","artwork":"x","duration":1,"$timestamp":1,"$sortIndex":1,"__proto__":{"polluted":true}}',
        ) as Record<string, unknown>;
        const entries = decodePlaylistMusic([raw], FALLBACK);
        const { item } = entries[0]!;
        expect(Object.getPrototypeOf(item)).toBe(Object.prototype);
        expect(Object.prototype.hasOwnProperty.call(item, '__proto__')).toBe(
            true,
        );
        expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    });
});

describe('decodeLegacySummary', () => {
    const IMPORTED = 1_800_000_000_000;

    it('用户歌单 → user 摘要（封面默认自动），用传入 musicCount + legacy createAt', () => {
        const decoded = decodeLegacySummary(
            { id: 'u1', platform: '本地', title: '歌单甲', createAt: 111 },
            5,
            IMPORTED,
        );
        expect(decoded).toEqual({
            summary: {
                id: 'u1',
                kind: 'user',
                title: '歌单甲',
                description: undefined,
                artwork: undefined,
                hasCustomArtwork: false,
                musicCount: 5,
                createdAt: 111,
            },
        });
    });

    it('favorite id → favorite 变体', () => {
        const decoded = decodeLegacySummary(
            { id: 'favorite', title: '我喜欢' },
            0,
            IMPORTED,
        );
        expect(decoded?.summary.kind).toBe('favorite');
        expect(decoded?.summary.id).toBe('favorite');
    });

    it('数字 id 转字符串', () => {
        const decoded = decodeLegacySummary(
            { id: 123, title: 't' },
            0,
            IMPORTED,
        );
        expect(decoded?.summary.id).toBe('123');
        expect(decoded?.summary.kind).toBe('user');
    });

    it('无有效 id → undefined', () => {
        expect(
            decodeLegacySummary({ title: 't' }, 0, IMPORTED),
        ).toBeUndefined();
        expect(decodeLegacySummary({ id: '' }, 0, IMPORTED)).toBeUndefined();
        expect(decodeLegacySummary(null, 0, IMPORTED)).toBeUndefined();
    });

    it('缺 createAt → 回退 importedAt', () => {
        const decoded = decodeLegacySummary(
            { id: 'u1', title: 't' },
            0,
            IMPORTED,
        );
        expect(decoded?.summary.createdAt).toBe(IMPORTED);
    });

    it('file:// 封面（含 #timestamp）→ summary 仍自动，另出 customArtworkSource', () => {
        const decoded = decodeLegacySummary(
            {
                id: 'u1',
                title: 't',
                coverImg: 'file:///d/sheetu1.jpg#1710000000000',
            },
            0,
            IMPORTED,
        );
        expect(decoded?.summary.hasCustomArtwork).toBe(false);
        expect(decoded?.summary.artwork).toBeUndefined();
        expect(decoded?.customArtworkSource).toBe(
            'file:///d/sheetu1.jpg#1710000000000',
        );
    });

    it('远程 / content:// / 裸路径 → 自动，无 customArtworkSource', () => {
        for (const cover of [
            'https://x.invalid/a.jpg',
            'content://media/1',
            '/data/local.jpg',
        ]) {
            const decoded = decodeLegacySummary(
                { id: 'u1', title: 't', coverImg: cover },
                0,
                IMPORTED,
            );
            expect(decoded?.summary.hasCustomArtwork).toBe(false);
            expect(decoded?.customArtworkSource).toBeUndefined();
        }
    });

    it('artwork 优先于 coverImg 作 customArtworkSource', () => {
        const decoded = decodeLegacySummary(
            {
                id: 'u1',
                title: 't',
                artwork: 'file:///d/a.jpg',
                coverImg: 'file:///d/b.jpg',
            },
            0,
            IMPORTED,
        );
        expect(decoded?.customArtworkSource).toBe('file:///d/a.jpg');
    });

    it('封面首尾空白被 trim 后仍识别为自定义封面；纯空白视为无封面', () => {
        const padded = decodeLegacySummary(
            { id: 'u1', title: 't', coverImg: '  file:///d/a.jpg  ' },
            0,
            IMPORTED,
        );
        expect(padded?.customArtworkSource).toBe('file:///d/a.jpg');

        const blank = decodeLegacySummary(
            {
                id: 'u1',
                title: 't',
                artwork: '   ',
                coverImg: 'file:///d/b.jpg',
            },
            0,
            IMPORTED,
        );
        // 纯空白的 artwork 不再压过 coverImg
        expect(blank?.customArtworkSource).toBe('file:///d/b.jpg');
    });

    it('缺 title → 空串；description 存在则保留', () => {
        const decoded = decodeLegacySummary(
            { id: 'u1', description: '描述' },
            0,
            IMPORTED,
        );
        expect(decoded?.summary.title).toBe('');
        expect(decoded?.summary.description).toBe('描述');
    });

    it('解码摘要写入 clean store 后回读为 valid（wire 兼容）', () => {
        const decoded = decodeLegacySummary(
            { id: 'u1', title: 't', createAt: 5 },
            3,
            IMPORTED,
        );
        const store = fakeStore();
        writeIndex(store, [decoded!.summary]);
        expect(readIndex(store).status).toBe('valid');
    });
});

describe('decodeLegacyStarred', () => {
    it('保留 platform+id + 插件字段 + 可选 musicList', () => {
        const starred = decodeLegacyStarred([
            {
                platform: '示例源',
                id: 's1',
                title: '榜单',
                extra: 42,
                musicList: [{ platform: '示例源', id: 'm1' }],
            },
        ]);
        expect(starred).toEqual([
            {
                platform: '示例源',
                id: 's1',
                title: '榜单',
                extra: 42,
                musicList: [{ platform: '示例源', id: 'm1' }],
            },
        ]);
    });

    it('数字 id 转字符串', () => {
        const starred = decodeLegacyStarred([{ platform: 'p', id: 7 }]);
        expect(starred[0]!.id).toBe('7');
    });

    it('旧拼写 createAt → 补 canonical createdAt 且保留旧键', () => {
        const starred = decodeLegacyStarred([
            { platform: 'p', id: 's1', createAt: 111 },
        ]) as unknown as { createdAt?: number; createAt?: number }[];
        expect(starred[0]!.createdAt).toBe(111);
        expect(starred[0]!.createAt).toBe(111);
    });

    it('缺 platform 或 id 的项丢弃', () => {
        const starred = decodeLegacyStarred([
            { id: 's1' },
            { platform: 'p' },
            { platform: 'p', id: 's2' },
        ]);
        expect(starred).toHaveLength(1);
        expect(starred[0]!.id).toBe('s2');
    });

    it('按 MediaRef 去重保首条', () => {
        const starred = decodeLegacyStarred([
            { platform: 'p', id: 'a', title: '先' },
            { platform: 'p', id: 'a', title: '后' },
        ]);
        expect(starred).toHaveLength(1);
        expect(starred[0]!.title).toBe('先');
    });

    it('深拷贝：改结果不影响输入', () => {
        const input = [
            { platform: 'p', id: 'a', musicList: [{ platform: 'p', id: 'm' }] },
        ];
        const starred = decodeLegacyStarred(input) as unknown as Array<{
            musicList: Array<{ id: string }>;
        }>;
        starred[0]!.musicList[0]!.id = 'changed';
        expect(input[0]!.musicList[0]!.id).toBe('m');
    });

    it('非数组 → 空数组', () => {
        expect(decodeLegacyStarred(null)).toEqual([]);
        expect(decodeLegacyStarred({})).toEqual([]);
    });

    it('数字 id 与等值字符串 id 规范化后去重', () => {
        const starred = decodeLegacyStarred([
            { platform: 'p', id: 7, title: '先' },
            { platform: 'p', id: '7', title: '后' },
        ]);
        expect(starred).toHaveLength(1);
        expect(starred[0]!.title).toBe('先');
    });

    it('own __proto__/$ 字段安全穿过深拷贝、不污染原型', () => {
        const raw = JSON.parse(
            '[{"platform":"p","id":"a","$x":9,"__proto__":{"polluted":1}}]',
        );
        const starred = decodeLegacyStarred(raw);
        expect(starred).toHaveLength(1);
        expect((starred[0] as Record<string, unknown>).$x).toBe(9);
        expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    });

    it('解码 starred 写入 clean store 后回读为 valid（wire 兼容）', () => {
        const starred = decodeLegacyStarred([
            { platform: 'p', id: 's1', title: '榜单' },
        ]);
        const store = fakeStore();
        writeStarred(store, starred);
        expect(readStarred(store).status).toBe('valid');
    });
});

describe('sortWireToMode', () => {
    it.each([
        ['None', PlaylistMusicSortMode.Manual],
        ['title', PlaylistMusicSortMode.Title],
        ['artist', PlaylistMusicSortMode.Artist],
        ['album', PlaylistMusicSortMode.Album],
        ['time', PlaylistMusicSortMode.AddedAtDesc],
        ['time-rev', PlaylistMusicSortMode.AddedAt],
    ])('%s → %s', (wire, mode) => {
        expect(sortWireToMode(wire)).toBe(mode);
    });

    it('未知/null/undefined → Manual', () => {
        expect(sortWireToMode('xyz')).toBe(PlaylistMusicSortMode.Manual);
        expect(sortWireToMode(null)).toBe(PlaylistMusicSortMode.Manual);
        expect(sortWireToMode(undefined)).toBe(PlaylistMusicSortMode.Manual);
    });
});

describe('importLegacyIntoV1', () => {
    const IMPORTED = 1_800_000_000_000;

    /** 按 store id 隔离的假 MMKV；seed 预置 legacy 数据 */
    function fakeStores(seed: Record<string, Record<string, string>> = {}) {
        const stores = new Map<string, Map<string, string>>();
        for (const [id, kv] of Object.entries(seed)) {
            stores.set(id, new Map(Object.entries(kv)));
        }
        const openStore = (id: string) => {
            let s = stores.get(id);
            if (!s) {
                s = new Map();
                stores.set(id, s);
            }
            const store = s;
            return {
                getString: (k: string) => store.get(k),
                set: (k: string, v: string) => {
                    store.set(k, v);
                },
                remove: (k: string) => {
                    store.delete(k);
                },
            };
        };
        return { stores, openStore };
    }

    function makeDeps(seed: Record<string, Record<string, string>>): {
        d: LegacyImportDeps;
        stores: Map<string, Map<string, string>>;
    } {
        const { stores, openStore } = fakeStores(seed);
        return { d: { openStore, importedAt: IMPORTED }, stores };
    }

    it('全量导入：索引/曲目/排序/starred/favorite（封面按自动）', () => {
        const { d } = makeDeps({
            [LEGACY_INDEX_STORE_ID]: {
                data: JSON.stringify([
                    {
                        id: 'favorite',
                        platform: '本地',
                        title: '我喜欢',
                        coverImg: 'file:///cache/fav.jpg',
                    },
                    {
                        id: 'u1',
                        platform: '本地',
                        title: '歌单甲',
                        createAt: 111,
                    },
                ]),
            },
            [legacyPlaylistStoreId('favorite')]: { data: JSON.stringify([]) },
            [legacyPlaylistStoreId('u1')]: {
                data: JSON.stringify([
                    {
                        platform: 'p',
                        id: 'm1',
                        title: '歌',
                        artist: '手',
                        album: '碟',
                        artwork: 'https://x/a.jpg',
                        duration: 1,
                        $timestamp: 5,
                        $sortIndex: 0,
                    },
                ]),
                'meta.sort': 'time',
            },
            [LEGACY_STARRED_STORE_ID]: {
                data: JSON.stringify([
                    { platform: 'q', id: 's1', title: '榜单' },
                ]),
            },
        });
        const report = importLegacyIntoV1(d);
        expect(report.skippedLocalPlaylistIds).toEqual([]);
        expect(report.starredSkipped).toBe(false);

        const index = readIndex(d.openStore(PLAYLIST_INDEX_STORE_ID));
        expect(index.status).toBe('valid');
        const summaries = index.status === 'valid' ? index.value : [];
        expect(summaries.map(s => s.id)).toEqual(['favorite', 'u1']);
        const u1 = summaries.find(s => s.id === 'u1')!;
        expect(u1.musicCount).toBe(1);
        expect(u1.createdAt).toBe(111);
        expect(summaries.find(s => s.id === 'favorite')!.hasCustomArtwork).toBe(
            false,
        );

        const music = readMusic(d.openStore(playlistStoreId('u1')));
        expect(music.status).toBe('valid');
        if (music.status === 'valid') {
            expect(music.value).toHaveLength(1);
            expect('$timestamp' in music.value[0]!.item).toBe(false);
        }
        expect(readSortMode(d.openStore(playlistStoreId('u1')))).toBe(
            'addedAtDesc',
        );

        const starred = readStarred(d.openStore(STARRED_STORE_ID));
        expect(starred.status).toBe('valid');
        if (starred.status === 'valid') {
            expect(starred.value).toHaveLength(1);
        }
    });

    it('全新安装（无 legacy）→ 干净索引/starred 空且 valid', () => {
        const { d } = makeDeps({});
        importLegacyIntoV1(d);
        const index = readIndex(d.openStore(PLAYLIST_INDEX_STORE_ID));
        expect(index.status).toBe('valid');
        if (index.status === 'valid') {
            expect(index.value).toEqual([]);
        }
        expect(readStarred(d.openStore(STARRED_STORE_ID)).status).toBe('valid');
    });

    it('legacy 存在（MusicSheetVersion）但索引丢失 → 抛错、不写空覆盖', () => {
        const { d, stores } = makeDeps({
            [LEGACY_META_STORE_ID]: { MusicSheetVersion: '2' },
        });
        expect(() => importLegacyIntoV1(d)).toThrow(/索引丢失/);
        expect(stores.get(PLAYLIST_INDEX_STORE_ID)).toBeUndefined();
    });

    it('legacy 索引损坏 → 抛错、不写空覆盖', () => {
        const { d, stores } = makeDeps({
            [LEGACY_INDEX_STORE_ID]: { data: '{ not json' },
        });
        expect(() => importLegacyIntoV1(d)).toThrow(/索引损坏/);
        expect(stores.get(PLAYLIST_INDEX_STORE_ID)).toBeUndefined();
    });

    it('重复归一化 id → 视为损坏、抛错', () => {
        const { d } = makeDeps({
            [LEGACY_INDEX_STORE_ID]: {
                data: JSON.stringify([
                    { id: 7, platform: '本地', title: 'a' },
                    { id: '7', platform: '本地', title: 'b' },
                ]),
            },
        });
        expect(() => importLegacyIntoV1(d)).toThrow(/重复/);
    });

    it('单歌单曲目损坏 → 跳过并计入 report，其它照常', () => {
        const { d } = makeDeps({
            [LEGACY_INDEX_STORE_ID]: {
                data: JSON.stringify([
                    { id: 'bad', platform: '本地', title: '坏' },
                    { id: 'ok', platform: '本地', title: '好' },
                ]),
            },
            [legacyPlaylistStoreId('bad')]: { data: '{ corrupt' },
            [legacyPlaylistStoreId('ok')]: { data: JSON.stringify([]) },
        });
        const report = importLegacyIntoV1(d);
        expect(report.skippedLocalPlaylistIds).toEqual(['bad']);
        const index = readIndex(d.openStore(PLAYLIST_INDEX_STORE_ID));
        expect(index.status).toBe('valid');
        if (index.status === 'valid') {
            expect(index.value.map(s => s.id)).toEqual(['ok']);
        }
    });

    it('曲目 store 缺失（非损坏）→ 空歌单导入、不跳过', () => {
        const { d } = makeDeps({
            [LEGACY_INDEX_STORE_ID]: {
                data: JSON.stringify([
                    { id: 'u1', platform: '本地', title: 't' },
                ]),
            },
        });
        const report = importLegacyIntoV1(d);
        expect(report.skippedLocalPlaylistIds).toEqual([]);
        const index = readIndex(d.openStore(PLAYLIST_INDEX_STORE_ID));
        expect(index.status).toBe('valid');
        if (index.status === 'valid') {
            expect(index.value.map(s => s.id)).toEqual(['u1']);
            expect(index.value[0]!.musicCount).toBe(0);
        }
        expect(readMusic(d.openStore(playlistStoreId('u1'))).status).toBe(
            'valid',
        );
    });

    it('starred 损坏 → 不发空数组 + report.starredSkipped', () => {
        const { d } = makeDeps({
            [LEGACY_INDEX_STORE_ID]: { data: JSON.stringify([]) },
            [LEGACY_STARRED_STORE_ID]: { data: '{ corrupt' },
        });
        const report = importLegacyIntoV1(d);
        expect(report.starredSkipped).toBe(true);
        expect(readStarred(d.openStore(STARRED_STORE_ID)).status).toBe(
            'missing',
        );
    });

    it('写入异常向上抛（不吞、不半写提交）', () => {
        const { openStore } = fakeStores({
            [LEGACY_INDEX_STORE_ID]: {
                data: JSON.stringify([
                    { id: 'u1', platform: '本地', title: 't' },
                ]),
            },
            [legacyPlaylistStoreId('u1')]: { data: JSON.stringify([]) },
        });
        const failing: LegacyImportDeps = {
            importedAt: IMPORTED,
            openStore: (id: string) => {
                const s = openStore(id);
                if (id === playlistStoreId('u1')) {
                    return {
                        ...s,
                        set: () => {
                            throw new Error('mmkv set failed');
                        },
                    };
                }
                return s;
            },
        };
        expect(() => importLegacyIntoV1(failing)).toThrow('mmkv set failed');
    });
});
