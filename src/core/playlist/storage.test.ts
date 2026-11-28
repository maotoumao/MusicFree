import {
    PLAYLIST_INDEX_STORE_ID,
    playlistStoreId,
    readIndex,
    readMusic,
    readSortMode,
    readStarred,
    STARRED_STORE_ID,
    writeIndex,
    writeMusic,
    writeSortMode,
    writeStarred,
} from './storage';
import { PlaylistMusicSortMode } from './types';

import type { PlaylistMusicEntry, StoredPlaylistSummary } from './storage';
import type { StarredPlaylist } from './types';

const DATA = 'data';
const SORT = 'meta.sort';

/** 用 key→raw 映射构造最小 MMKV 读取器 */
function reader(entries: Record<string, string>): {
    getString(key: string): string | undefined;
} {
    return { getString: (key: string) => entries[key] };
}

/** 构造一条合法 user 摘要（可覆盖字段） */
function summary(over: Record<string, unknown>): Record<string, unknown> {
    return {
        id: 'u1',
        kind: 'user',
        title: 't',
        hasCustomArtwork: false,
        musicCount: 0,
        createdAt: 1,
        ...over,
    };
}

/** 读单条摘要的分类状态 */
function indexStatus(over: Record<string, unknown>): string {
    return readIndex(reader({ [DATA]: JSON.stringify([summary(over)]) }))
        .status;
}

/** Map 支撑的读写双面 store，用于往返测试 */
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

describe('readIndex', () => {
    it('key 缺失 → missing', () => {
        expect(readIndex(reader({}))).toEqual({ status: 'missing' });
    });

    it('JSON 损坏 → corrupt（保留 raw）', () => {
        expect(readIndex(reader({ [DATA]: '{bad' }))).toEqual({
            status: 'corrupt',
            raw: '{bad',
        });
    });

    it('合法摘要数组 → valid', () => {
        const raw = JSON.stringify([
            {
                id: 'favorite',
                kind: 'favorite',
                title: '我喜欢',
                hasCustomArtwork: false,
                musicCount: 3,
                createdAt: 1,
            },
        ]);
        const result = readIndex(reader({ [DATA]: raw }));
        expect(result.status).toBe('valid');
        if (result.status === 'valid') {
            expect(result.value[0]!.id).toBe('favorite');
        }
    });

    it('形状不符（缺 musicCount）→ corrupt', () => {
        const raw = JSON.stringify([
            {
                id: 'a',
                kind: 'user',
                title: 't',
                hasCustomArtwork: false,
                createdAt: 1,
            },
        ]);
        expect(readIndex(reader({ [DATA]: raw })).status).toBe('corrupt');
    });

    it('非数组 → corrupt', () => {
        expect(readIndex(reader({ [DATA]: '{}' })).status).toBe('corrupt');
    });

    it('空数组 → valid 空', () => {
        expect(readIndex(reader({ [DATA]: '[]' }))).toEqual({
            status: 'valid',
            value: [],
            raw: '[]',
        });
    });

    it('有效项与坏项混排 → 整份 corrupt', () => {
        const raw = JSON.stringify([summary({ id: 'ok' }), { id: 'bad' }]);
        expect(readIndex(reader({ [DATA]: raw })).status).toBe('corrupt');
    });

    it('合法 favorite（kind/id 一致）→ valid', () => {
        expect(indexStatus({ id: 'favorite', kind: 'favorite' })).toBe('valid');
    });

    it('favorite 的 kind/id 错配 → corrupt', () => {
        expect(indexStatus({ id: 'favorite', kind: 'user' })).toBe('corrupt');
        expect(indexStatus({ id: 'x', kind: 'favorite' })).toBe('corrupt');
    });

    it('musicCount 负数/小数 → corrupt', () => {
        expect(indexStatus({ musicCount: -1 })).toBe('corrupt');
        expect(indexStatus({ musicCount: 0.5 })).toBe('corrupt');
    });

    it('可选字段非字符串 → corrupt', () => {
        expect(indexStatus({ description: 1 })).toBe('corrupt');
        expect(indexStatus({ artwork: {} })).toBe('corrupt');
    });

    it('存在但非法的 JSON 标量 → corrupt', () => {
        for (const raw of ['', 'null', 'false', '0', '""']) {
            expect(readIndex(reader({ [DATA]: raw })).status).toBe('corrupt');
        }
    });
});

describe('readMusic', () => {
    it('合法 entry 数组 → valid', () => {
        const raw = JSON.stringify([
            {
                addedAt: 10,
                batchRank: 2,
                item: { platform: 'p', id: 'a', title: 'x' },
            },
        ]);
        const result = readMusic(reader({ [DATA]: raw }));
        expect(result.status).toBe('valid');
        if (result.status === 'valid') {
            expect(result.value[0]!.item.id).toBe('a');
            expect(result.value[0]!.batchRank).toBe(2);
        }
    });

    it('entry 的 item 缺主键 → corrupt', () => {
        const raw = JSON.stringify([
            { addedAt: 1, batchRank: 1, item: { platform: '', id: 'a' } },
        ]);
        expect(readMusic(reader({ [DATA]: raw })).status).toBe('corrupt');
    });

    it('entry 缺 addedAt → corrupt', () => {
        const raw = JSON.stringify([
            { batchRank: 1, item: { platform: 'p', id: 'a' } },
        ]);
        expect(readMusic(reader({ [DATA]: raw })).status).toBe('corrupt');
    });

    it('缺失 → missing', () => {
        expect(readMusic(reader({})).status).toBe('missing');
    });
});

describe('readSortMode', () => {
    it('合法干净枚举值原样返回', () => {
        expect(readSortMode(reader({ [SORT]: 'addedAtDesc' }))).toBe(
            'addedAtDesc',
        );
    });

    it('legacy wire 值不认 → undefined', () => {
        expect(readSortMode(reader({ [SORT]: 'time' }))).toBeUndefined();
    });

    it('缺失 → undefined', () => {
        expect(readSortMode(reader({}))).toBeUndefined();
    });
});

describe('readStarred', () => {
    it('合法快照数组 → valid', () => {
        const raw = JSON.stringify([
            { platform: 'p', id: 's1', title: '榜单' },
        ]);
        expect(readStarred(reader({ [DATA]: raw })).status).toBe('valid');
    });

    it('缺主键 → corrupt', () => {
        const raw = JSON.stringify([{ title: '无主键' }]);
        expect(readStarred(reader({ [DATA]: raw })).status).toBe('corrupt');
    });

    it('只缺 platform → corrupt', () => {
        const raw = JSON.stringify([{ id: 's1' }]);
        expect(readStarred(reader({ [DATA]: raw })).status).toBe('corrupt');
    });

    it('只缺 id → corrupt', () => {
        const raw = JSON.stringify([{ platform: 'p' }]);
        expect(readStarred(reader({ [DATA]: raw })).status).toBe('corrupt');
    });
});

describe('store id 命名空间', () => {
    it('动态歌单 store 不与固定 index/starred 撞名', () => {
        expect(playlistStoreId('index')).not.toBe(PLAYLIST_INDEX_STORE_ID);
        expect(playlistStoreId('starred')).not.toBe(STARRED_STORE_ID);
    });

    it('固定与动态 store id 的 wire 值', () => {
        expect(PLAYLIST_INDEX_STORE_ID).toBe('Playlist.index');
        expect(STARRED_STORE_ID).toBe('Playlist.starred');
        expect(playlistStoreId('abc')).toBe('Playlist.local.abc');
    });
});

describe('写 + round-trip', () => {
    it('index round-trip', () => {
        const store = fakeStore();
        const summaries: StoredPlaylistSummary[] = [
            {
                id: 'u1',
                kind: 'user',
                title: 't',
                hasCustomArtwork: false,
                musicCount: 2,
                createdAt: 5,
            },
        ];
        writeIndex(store, summaries);
        const result = readIndex(store);
        expect(result.status).toBe('valid');
        if (result.status === 'valid') {
            expect(result.value).toEqual(summaries);
        }
    });

    it('music round-trip', () => {
        const store = fakeStore();
        const entries = [
            {
                addedAt: 10,
                batchRank: 2,
                item: {
                    platform: 'p',
                    id: 'a',
                    title: 't',
                    artist: 'ar',
                    album: 'al',
                    artwork: '',
                    duration: 0,
                },
            },
        ] satisfies readonly PlaylistMusicEntry[];
        writeMusic(store, entries);
        const result = readMusic(store);
        expect(result.status).toBe('valid');
        if (result.status === 'valid') {
            expect(result.value).toEqual(entries);
        }
    });

    it('sort round-trip', () => {
        const store = fakeStore();
        writeSortMode(store, PlaylistMusicSortMode.AddedAtDesc);
        expect(readSortMode(store)).toBe('addedAtDesc');
    });

    it('starred round-trip', () => {
        const store = fakeStore();
        const snapshots = [
            { platform: 'p', id: 's1', title: '榜单' },
        ] satisfies readonly StarredPlaylist[];
        writeStarred(store, snapshots);
        const result = readStarred(store);
        expect(result.status).toBe('valid');
        if (result.status === 'valid') {
            expect(result.value).toEqual(snapshots);
        }
    });

    it('序列化失败向上抛（循环引用）', () => {
        const store = fakeStore();
        const circular: Record<string, unknown> = {};
        circular.self = circular;
        const entries = [
            { addedAt: 1, batchRank: 1, item: circular },
        ] as unknown as PlaylistMusicEntry[];
        expect(() => writeMusic(store, entries)).toThrow();
    });

    it('set 抛错向上冒泡', () => {
        const store = {
            getString: () => undefined,
            set: () => {
                throw new Error('mmkv set failed');
            },
            remove: () => {},
        };
        const summaries: StoredPlaylistSummary[] = [
            {
                id: 'u1',
                kind: 'user',
                title: 't',
                hasCustomArtwork: false,
                musicCount: 0,
                createdAt: 1,
            },
        ];
        expect(() => writeIndex(store, summaries)).toThrow('mmkv set failed');
    });
});
