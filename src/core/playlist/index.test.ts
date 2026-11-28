import { getOrCreateMMKV, getStoreVersion } from '@/infra/storage';
import { atomStore } from '@/utils/atomStore';
import { LOCAL_MEDIA_PLATFORM } from '@/utils/media';

import { persistArtwork, removeArtwork } from './artworkStore';
import {
    LEGACY_INDEX_STORE_ID,
    LEGACY_STARRED_STORE_ID,
    legacyPlaylistStoreId,
} from './legacyImport';
import {
    PLAYLIST_INDEX_STORE_ID,
    playlistStoreId,
    STARRED_STORE_ID,
} from './storage';
import {
    favoriteKeysAtom,
    loadedDetailsAtom,
    setLoadedDetail,
    starredKeysAtom,
    starredPlaylistsAtom,
} from './store';
import {
    LOCAL_PLAYLIST_DESCRIPTION_MAX_LENGTH,
    LOCAL_PLAYLIST_TITLE_MAX_LENGTH,
    PlaylistMusicSortMode,
} from './types';

import { Playlist } from '.';

import type { PlaylistMusicEntry, StoredPlaylistSummary } from './storage';
import type { LocalPlaylistDetail, LocalPlaylistTransferItem } from './types';
import type { IConfig } from '@/core/config';
import type { IErrorLog } from '@/core/errorLog';
import type { MediaRef, MusicItem, PlaylistItemBase } from '@/types';

interface FakeStore {
    getString(key: string): string | undefined;
    getNumber(key: string): number | undefined;
    set(key: string, value: string | number): void;
    remove(key: string): void;
    clearAll(): void;
}

// setLoadedDetail 包一层可控假体：模拟装载中途抛错（1e28c0a 修过的封面字段畸形就是从这一步炸出来的）
jest.mock('./store', () => {
    const actual = jest.requireActual<typeof import('./store')>('./store');
    return {
        ...actual,
        setLoadedDetail: jest.fn(actual.setLoadedDetail),
    };
});
jest.mock('@/infra/storage', () => {
    const stores = new Map<string, FakeStore>();
    const VERSION_KEY = '$version';
    const create = (): FakeStore => {
        const strings = new Map<string, string>();
        const numbers = new Map<string, number>();
        return {
            getString: key => strings.get(key),
            getNumber: key => numbers.get(key),
            set: (key, value) => {
                if (typeof value === 'number') {
                    numbers.set(key, value);
                } else {
                    strings.set(key, value);
                }
            },
            remove: key => {
                strings.delete(key);
                numbers.delete(key);
            },
            clearAll: () => {
                strings.clear();
                numbers.clear();
            },
        };
    };
    return {
        __stores: stores,
        getOrCreateMMKV: (id: string) => {
            let store = stores.get(id);
            if (!store) {
                store = create();
                stores.set(id, store);
            }
            return store;
        },
        getStoreVersion: (mmkv: FakeStore) => mmkv.getNumber(VERSION_KEY) ?? 0,
        setStoreVersion: (mmkv: FakeStore, version: number) =>
            mmkv.set(VERSION_KEY, version),
    };
});

jest.mock('./artworkStore', () => ({
    persistArtwork: jest.fn(),
    removeArtwork: jest.fn(),
}));

const registry = (
    jest.requireMock('@/infra/storage') as {
        __stores: Map<string, FakeStore>;
    }
).__stores;
const mockPersist = jest.mocked(persistArtwork);
const mockRemove = jest.mocked(removeArtwork);

/** 本地数据降级只往这里留痕；用例据此断言「静默路径有日志」 */
const errorLog = { capture: jest.fn() } as unknown as IErrorLog;
/** 唯一一条 localData 记录里的 Error（一次启动只该落一条，多了或少了都是错） */
function capturedIssue(): Error {
    const calls = (errorLog.capture as jest.Mock).mock.calls as Array<
        [{ source: string; error: unknown }]
    >;
    expect(calls).toHaveLength(1);
    const capture = calls[0]![0];
    expect(capture.source).toBe('localData');
    expect(capture.error).toBeInstanceOf(Error);
    return capture.error as Error;
}

const config = {
    get: jest.fn(),
    // 真实实现按 configRules 校验；此处只覆盖用到的排序 key 的值域
    isValid: (_key: unknown, value: unknown) =>
        Object.values(PlaylistMusicSortMode).includes(
            value as PlaylistMusicSortMode,
        ),
} as unknown as IConfig;

function music(id: string, over: Partial<MusicItem> = {}): MusicItem {
    return {
        platform: 'p',
        id,
        title: '',
        artist: '',
        album: '',
        artwork: '',
        duration: 0,
        ...over,
    };
}

function entry(
    item: MusicItem,
    addedAt: number,
    batchRank: number,
): PlaylistMusicEntry {
    return { item, addedAt, batchRank };
}

function seedMusic(id: string, entries: PlaylistMusicEntry[]): void {
    getOrCreateMMKV(playlistStoreId(id)).set('data', JSON.stringify(entries));
}

/** 预置已迁移的干净 index（含 $version=1，跳过 v0→v1）*/
function seedIndex(summaries: unknown[]): void {
    const store = getOrCreateMMKV(PLAYLIST_INDEX_STORE_ID);
    store.set('data', JSON.stringify(summaries));
    store.set('$version', 1);
}

/** 预置已迁移但 index 原始损坏的数据 */
function seedRawIndex(raw: string): void {
    const store = getOrCreateMMKV(PLAYLIST_INDEX_STORE_ID);
    store.set('data', raw);
    store.set('$version', 1);
}

function readPersistedIndex(): StoredPlaylistSummary[] {
    const raw = getOrCreateMMKV(PLAYLIST_INDEX_STORE_ID).getString('data');
    return raw ? (JSON.parse(raw) as StoredPlaylistSummary[]) : [];
}

function userSummary(id: string, title = id): StoredPlaylistSummary {
    return {
        id,
        kind: 'user',
        title,
        hasCustomArtwork: false,
        musicCount: 0,
        createdAt: 1,
    };
}

function favoriteSummary(): StoredPlaylistSummary {
    return {
        id: 'favorite',
        kind: 'favorite',
        title: '',
        hasCustomArtwork: false,
        musicCount: 0,
        createdAt: 1,
    };
}

function localTransfer(
    id: string,
    over: Partial<LocalPlaylistTransferItem> = {},
): LocalPlaylistTransferItem {
    return { id, title: id, musicList: [], ...over };
}

async function setupFresh(): Promise<Playlist> {
    const playlist = new Playlist({ config, errorLog });
    await playlist.setup();
    return playlist;
}

beforeEach(() => {
    registry.clear();
    (errorLog.capture as jest.Mock).mockClear();
    (config.get as unknown as jest.Mock).mockReset();
    mockPersist.mockReset();
    mockRemove.mockReset();
    mockRemove.mockResolvedValue(undefined);
    atomStore.set(favoriteKeysAtom, new Set<string>());
    atomStore.set(loadedDetailsAtom, new Map<string, LocalPlaylistDetail>());
    atomStore.set(starredPlaylistsAtom, []);
    atomStore.set(starredKeysAtom, new Set<string>());
});

describe('setup / hydrate', () => {
    it('全新安装：建 favorite、状态 ready、落盘', async () => {
        const playlist = await setupFresh();
        expect(playlist.getStatus()).toBe('ready');
        const list = playlist.getLocalPlaylists();
        expect(list).toHaveLength(1);
        expect(list[0]!.id).toBe('favorite');
        expect(list[0]!.kind).toBe('favorite');
        expect(readPersistedIndex()[0]!.id).toBe('favorite');
    });

    it('有效 index：水合并保证 favorite 居首', async () => {
        seedIndex([favoriteSummary(), userSummary('a'), userSummary('b')]);
        const playlist = await setupFresh();
        expect(playlist.getLocalPlaylists().map(p => p.id)).toEqual([
            'favorite',
            'a',
            'b',
        ]);
    });

    it('缺 favorite：补建并置首、落盘', async () => {
        seedIndex([userSummary('a')]);
        const playlist = await setupFresh();
        expect(playlist.getLocalPlaylists().map(p => p.id)).toEqual([
            'favorite',
            'a',
        ]);
        expect(readPersistedIndex().map(s => s.id)).toEqual(['favorite', 'a']);
    });

    it('favorite 不在首位：移到首位', async () => {
        seedIndex([userSummary('a'), favoriteSummary(), userSummary('b')]);
        const playlist = await setupFresh();
        expect(playlist.getLocalPlaylists().map(p => p.id)).toEqual([
            'favorite',
            'a',
            'b',
        ]);
    });

    it('index 损坏：degraded 只读、不建 favorite 覆盖，且进错误日志', async () => {
        seedRawIndex('{ not json');
        const playlist = await setupFresh();
        expect(playlist.getStatus()).toBe('degraded');
        expect(playlist.getLocalPlaylists()).toHaveLength(0);
        // 未用 favorite 覆盖损坏 raw
        expect(getOrCreateMMKV(PLAYLIST_INDEX_STORE_ID).getString('data')).toBe(
            '{ not json',
        );
        expect(capturedIssue().message).toBe('歌单索引损坏，进入只读');
    });

    it('setup 恒 resolve（不因数据问题 reject）', async () => {
        seedRawIndex('broken');
        await expect(setupFresh()).resolves.toBeInstanceOf(Playlist);
    });

    it('index 含重复 id（形状合法）→ degraded', async () => {
        seedIndex([
            favoriteSummary(),
            userSummary('a'),
            userSummary('a', 'dup'),
        ]);
        const playlist = await setupFresh();
        expect(playlist.getStatus()).toBe('degraded');
        expect(playlist.getLocalPlaylists()).toHaveLength(0);
    });

    it('迁移/旧数据的 favorite 标题规范为空串并回写', async () => {
        seedIndex([
            { ...favoriteSummary(), title: '我喜欢' },
            userSummary('a'),
        ]);
        const playlist = await setupFresh();
        const fav = playlist.getLocalPlaylists()[0]!;
        expect(fav.id).toBe('favorite');
        expect(fav.title).toBe('');
        expect(readPersistedIndex()[0]!.title).toBe('');
    });
});

describe('createLocalPlaylist', () => {
    it('新歌单插在 favorite 之后、musicCount 0、落盘', async () => {
        const playlist = await setupFresh();
        const idA = await playlist.createLocalPlaylist({ title: 'A' });
        const idB = await playlist.createLocalPlaylist({ title: 'B' });
        const list = playlist.getLocalPlaylists();
        expect(list.map(p => p.id)).toEqual(['favorite', idB, idA]);
        expect(list[1]!.title).toBe('B');
        expect(list[1]!.musicCount).toBe(0);
        expect(idA).not.toBe('favorite');
        expect(readPersistedIndex().map(s => s.id)).toEqual([
            'favorite',
            idB,
            idA,
        ]);
    });

    it('空白标题被接受、存为空串（显示层回落未命名）', async () => {
        const playlist = await setupFresh();
        const id = await playlist.createLocalPlaylist({ title: '   ' });
        expect(playlist.getLocalPlaylists().find(p => p.id === id)!.title).toBe(
            '',
        );
    });

    it('超长标题/简介按上限截断', async () => {
        const playlist = await setupFresh();
        const id = await playlist.createLocalPlaylist({
            title: 'a'.repeat(LOCAL_PLAYLIST_TITLE_MAX_LENGTH + 10),
            description: 'b'.repeat(LOCAL_PLAYLIST_DESCRIPTION_MAX_LENGTH + 10),
        });
        const found = playlist.getLocalPlaylists().find(p => p.id === id)!;
        expect(found.title.length).toBe(LOCAL_PLAYLIST_TITLE_MAX_LENGTH);
        expect(found.description!.length).toBe(
            LOCAL_PLAYLIST_DESCRIPTION_MAX_LENGTH,
        );
    });

    it('degraded 时 → StorageDegraded', async () => {
        seedRawIndex('broken');
        const playlist = await setupFresh();
        await expect(
            playlist.createLocalPlaylist({ title: 'A' }),
        ).rejects.toMatchObject({ code: 'STORAGE_DEGRADED' });
    });
});

describe('updateLocalPlaylist', () => {
    it('改标题与描述并落盘', async () => {
        seedIndex([favoriteSummary(), userSummary('a', '旧')]);
        const playlist = await setupFresh();
        await playlist.updateLocalPlaylist('a', {
            title: '新',
            description: '简介',
        });
        const found = playlist.getLocalPlaylists().find(p => p.id === 'a')!;
        expect(found.title).toBe('新');
        expect(found.description).toBe('简介');
    });

    it('超长标题/简介按上限截断', async () => {
        seedIndex([favoriteSummary(), userSummary('a', '旧')]);
        const playlist = await setupFresh();
        await playlist.updateLocalPlaylist('a', {
            title: 'a'.repeat(LOCAL_PLAYLIST_TITLE_MAX_LENGTH + 10),
            description: 'b'.repeat(LOCAL_PLAYLIST_DESCRIPTION_MAX_LENGTH + 10),
        });
        const found = playlist.getLocalPlaylists().find(p => p.id === 'a')!;
        expect(found.title.length).toBe(LOCAL_PLAYLIST_TITLE_MAX_LENGTH);
        expect(found.description!.length).toBe(
            LOCAL_PLAYLIST_DESCRIPTION_MAX_LENGTH,
        );
    });

    it('description 为 null 清除描述', async () => {
        seedIndex([
            favoriteSummary(),
            { ...userSummary('a'), description: '有' },
        ]);
        const playlist = await setupFresh();
        await playlist.updateLocalPlaylist('a', { description: null });
        expect(
            playlist.getLocalPlaylists().find(p => p.id === 'a')!.description,
        ).toBeUndefined();
    });

    it('改 favorite 标题 → FavoriteTitleProtected', async () => {
        const playlist = await setupFresh();
        await expect(
            playlist.updateLocalPlaylist('favorite', { title: 'x' }),
        ).rejects.toMatchObject({ code: 'FAVORITE_TITLE_PROTECTED' });
    });

    it('未知 id → LocalPlaylistNotFound', async () => {
        const playlist = await setupFresh();
        await expect(
            playlist.updateLocalPlaylist('missing', { title: 'x' }),
        ).rejects.toMatchObject({ code: 'LOCAL_PLAYLIST_NOT_FOUND' });
    });

    it('普通歌单改空白标题被接受、存为空串', async () => {
        seedIndex([favoriteSummary(), userSummary('a', '旧')]);
        const playlist = await setupFresh();
        await playlist.updateLocalPlaylist('a', { title: '   ' });
        expect(
            playlist.getLocalPlaylists().find(p => p.id === 'a')!.title,
        ).toBe('');
    });
});

describe('removeLocalPlaylists', () => {
    it('删普通歌单、计数、清理其 store', async () => {
        seedIndex([favoriteSummary(), userSummary('a'), userSummary('b')]);
        const playlist = await setupFresh();
        getOrCreateMMKV(playlistStoreId('a')).set('data', '[]');
        const result = await playlist.removeLocalPlaylists(['a']);
        expect(result).toEqual({ removed: 1, missing: 0, protectedSkipped: 0 });
        expect(playlist.getLocalPlaylists().map(p => p.id)).toEqual([
            'favorite',
            'b',
        ]);
        expect(
            getOrCreateMMKV(playlistStoreId('a')).getString('data'),
        ).toBeUndefined();
    });

    it('favorite 受保护、不删', async () => {
        const playlist = await setupFresh();
        const result = await playlist.removeLocalPlaylists(['favorite']);
        expect(result).toEqual({
            removed: 0,
            missing: 0,
            protectedSkipped: 1,
        });
        expect(playlist.getLocalPlaylists()).toHaveLength(1);
    });

    it('未知 id 计 missing', async () => {
        seedIndex([favoriteSummary(), userSummary('a')]);
        const playlist = await setupFresh();
        const result = await playlist.removeLocalPlaylists(['a', 'x', 'y']);
        expect(result).toEqual({ removed: 1, missing: 2, protectedSkipped: 0 });
    });

    it('删有自定义封面的歌单时清理封面文件', async () => {
        seedIndex([
            favoriteSummary(),
            {
                ...userSummary('a'),
                hasCustomArtwork: true,
                artwork: 'file:///art/a.jpg',
            },
        ]);
        const playlist = await setupFresh();
        await playlist.removeLocalPlaylists(['a']);
        expect(mockRemove).toHaveBeenCalledWith('file:///art/a.jpg');
    });
});

describe('reorderLocalPlaylists', () => {
    it('精确排列时重排、favorite 固定居首', async () => {
        seedIndex([
            favoriteSummary(),
            userSummary('a'),
            userSummary('b'),
            userSummary('c'),
        ]);
        const playlist = await setupFresh();
        await playlist.reorderLocalPlaylists(['c', 'a', 'b']);
        expect(playlist.getLocalPlaylists().map(p => p.id)).toEqual([
            'favorite',
            'c',
            'a',
            'b',
        ]);
    });

    it('长度不符 → InvalidLocalPlaylistOrder', async () => {
        seedIndex([favoriteSummary(), userSummary('a'), userSummary('b')]);
        const playlist = await setupFresh();
        await expect(
            playlist.reorderLocalPlaylists(['a']),
        ).rejects.toMatchObject({ code: 'INVALID_LOCAL_PLAYLIST_ORDER' });
    });

    it('含未知 id → InvalidLocalPlaylistOrder', async () => {
        seedIndex([favoriteSummary(), userSummary('a'), userSummary('b')]);
        const playlist = await setupFresh();
        await expect(
            playlist.reorderLocalPlaylists(['a', 'x']),
        ).rejects.toMatchObject({ code: 'INVALID_LOCAL_PLAYLIST_ORDER' });
    });
});

describe('setLocalPlaylistArtwork', () => {
    it('设置自定义封面：持久化、摘要升级', async () => {
        seedIndex([favoriteSummary(), userSummary('a')]);
        mockPersist.mockResolvedValue('file:///art/a-1.jpg');
        const playlist = await setupFresh();
        await playlist.setLocalPlaylistArtwork('a', 'file:///cache/pick.jpg');
        const found = playlist.getLocalPlaylists().find(p => p.id === 'a')!;
        expect(found.hasCustomArtwork).toBe(true);
        expect(found.artwork).toBe('file:///art/a-1.jpg');
        expect(mockPersist).toHaveBeenCalledWith('a', 'file:///cache/pick.jpg');
    });

    it('重置封面：清 meta、摘要回落、删旧文件', async () => {
        seedIndex([favoriteSummary(), userSummary('a')]);
        mockPersist.mockResolvedValue('file:///art/a-1.jpg');
        const playlist = await setupFresh();
        await playlist.setLocalPlaylistArtwork('a', 'file:///cache/pick.jpg');
        await playlist.setLocalPlaylistArtwork('a', null);
        const found = playlist.getLocalPlaylists().find(p => p.id === 'a')!;
        expect(found.hasCustomArtwork).toBe(false);
        expect(found.artwork).toBeUndefined();
        expect(mockRemove).toHaveBeenCalledWith('file:///art/a-1.jpg');
    });

    it('替换封面时删旧文件', async () => {
        seedIndex([favoriteSummary(), userSummary('a')]);
        mockPersist
            .mockResolvedValueOnce('file:///art/a-1.jpg')
            .mockResolvedValueOnce('file:///art/a-2.jpg');
        const playlist = await setupFresh();
        await playlist.setLocalPlaylistArtwork('a', 'file:///cache/1.jpg');
        await playlist.setLocalPlaylistArtwork('a', 'file:///cache/2.jpg');
        expect(mockRemove).toHaveBeenCalledWith('file:///art/a-1.jpg');
    });

    it('源不可读 → ArtworkSourceUnavailable、摘要不变', async () => {
        seedIndex([favoriteSummary(), userSummary('a')]);
        mockPersist.mockRejectedValue(new Error('unreadable'));
        const playlist = await setupFresh();
        await expect(
            playlist.setLocalPlaylistArtwork('a', 'file:///cache/x.jpg'),
        ).rejects.toMatchObject({ code: 'ARTWORK_SOURCE_UNAVAILABLE' });
        expect(
            playlist.getLocalPlaylists().find(p => p.id === 'a')!
                .hasCustomArtwork,
        ).toBe(false);
    });
});

describe('迁移接线', () => {
    it('setup 跑 v0→v1：把 legacy 歌单导入干净 index', async () => {
        getOrCreateMMKV(LEGACY_INDEX_STORE_ID).set(
            'data',
            JSON.stringify([{ id: '1', title: 'Legacy A' }]),
        );
        getOrCreateMMKV(legacyPlaylistStoreId('1')).set(
            'data',
            JSON.stringify([music('m1', { title: '歌' })]),
        );
        const playlist = await setupFresh();
        const list = playlist.getLocalPlaylists();
        expect(list.map(p => p.id)).toEqual(['favorite', '1']);
        expect(list.find(p => p.id === '1')!.title).toBe('Legacy A');
        expect(list.find(p => p.id === '1')!.musicCount).toBe(1);
        // 版本已 bump，不再重放
        expect(getStoreVersion(getOrCreateMMKV(PLAYLIST_INDEX_STORE_ID))).toBe(
            1,
        );
    });

    it('迁移抛错（legacy 索引损坏）→ degraded、不写 index，且进错误日志（带上原因）', async () => {
        getOrCreateMMKV(LEGACY_INDEX_STORE_ID).set('data', '{"not":"array"}');
        const playlist = await setupFresh();
        expect(playlist.getStatus()).toBe('degraded');
        expect(playlist.getLocalPlaylists()).toHaveLength(0);
        expect(capturedIssue().message).toBe(
            'legacy 歌单迁移中止，本次只读（legacy 索引损坏：中止导入（保 legacy、下次重放），不写空覆盖）',
        );
    });

    it('单个歌单曲目数据损坏 → 跳过它、其余照常导入，跳过的 id 进错误日志（有名有姓）', async () => {
        getOrCreateMMKV(LEGACY_INDEX_STORE_ID).set(
            'data',
            JSON.stringify([
                { id: 'good', title: 'Good' },
                { id: 'bad', title: 'Bad' },
            ]),
        );
        getOrCreateMMKV(legacyPlaylistStoreId('good')).set(
            'data',
            JSON.stringify([music('m1')]),
        );
        getOrCreateMMKV(legacyPlaylistStoreId('bad')).set(
            'data',
            '{"not":"array"}',
        );

        const playlist = await setupFresh();

        expect(playlist.getStatus()).toBe('ready');
        expect(playlist.getLocalPlaylists().map(p => p.id)).toEqual([
            'favorite',
            'good',
        ]);
        expect(capturedIssue().message).toBe(
            'legacy 导入跳过了 1 个曲目数据损坏的歌单：bad',
        );
    });

    it('favorite 详情组装中途抛错：setup 照常 resolve、模块 ready、starred 仍装载，favorite 按损坏只读并留痕', async () => {
        seedIndex([favoriteSummary(), userSummary('a')]);
        getOrCreateMMKV(STARRED_STORE_ID).set(
            'data',
            JSON.stringify([{ platform: 'p', id: 's1', title: 'S' }]),
        );
        (setLoadedDetail as jest.Mock).mockImplementationOnce(() => {
            throw new TypeError(
                "Cannot read properties of undefined (reading 'trim')",
            );
        });

        const playlist = await setupFresh();

        expect(playlist.getStatus()).toBe('ready');
        expect(playlist.getStarredPlaylists().map(p => p.id)).toEqual(['s1']);
        // 半发布的 favorite 不能再接受写入：整表覆盖会用半份镜像抹掉盘上数据
        await expect(
            playlist.toggleFavorite(music('f1')),
        ).rejects.toMatchObject({
            code: 'STORAGE_DEGRADED',
        });
        expect(capturedIssue().message).toBe(
            "favorite 装载抛错，按损坏只读（Cannot read properties of undefined (reading 'trim')）",
        );
    });

    it('跳过的歌单很多时日志只点名前 5 个', async () => {
        const ids = Array.from({ length: 7 }, (_, i) => `bad${i}`);
        getOrCreateMMKV(LEGACY_INDEX_STORE_ID).set(
            'data',
            JSON.stringify(ids.map(id => ({ id, title: id }))),
        );
        for (const id of ids) {
            getOrCreateMMKV(legacyPlaylistStoreId(id)).set(
                'data',
                '{"not":"array"}',
            );
        }

        await setupFresh();

        expect(capturedIssue().message).toBe(
            'legacy 导入跳过了 7 个曲目数据损坏的歌单：bad0, bad1, bad2, bad3, bad4 等 7 个',
        );
    });

    it('一次启动里多处问题只落一条记录（错误日志只与最新一条去重，重启重放才不会填满日志位）', async () => {
        getOrCreateMMKV(LEGACY_INDEX_STORE_ID).set(
            'data',
            JSON.stringify([{ id: 'bad', title: 'Bad' }]),
        );
        getOrCreateMMKV(legacyPlaylistStoreId('bad')).set(
            'data',
            '{"not":"array"}',
        );
        getOrCreateMMKV(LEGACY_STARRED_STORE_ID).set('data', '{"not":"array"}');

        await setupFresh();

        expect(capturedIssue().message).toBe(
            'legacy 导入跳过了 1 个曲目数据损坏的歌单：bad；legacy 收藏歌单数据损坏，未导入',
        );
    });
});

describe('封面字段容错', () => {
    // 模拟旧存储和历史曲目中的非字符串封面；身份有效，歌曲本身必须保留。
    const items = [
        music('valid', { artwork: 'cover.jpg' }),
        { ...music('object'), artwork: { uri: 'legacy.jpg' } },
        { ...music('array'), artwork: ['legacy.jpg'] },
        { ...music('number'), artwork: 42 },
        { ...music('null'), artwork: null },
        { ...music('missing'), artwork: undefined },
    ] as unknown as MusicItem[];

    it.each(['a', 'favorite'])(
        '旧歌单 %s 含非字符串封面：迁移后能打开，重启仍保留全部歌曲',
        async id => {
            const raw = JSON.stringify(items);
            getOrCreateMMKV(LEGACY_INDEX_STORE_ID).set(
                'data',
                JSON.stringify([{ id, title: 'Legacy' }]),
            );
            const legacyStore = getOrCreateMMKV(legacyPlaylistStoreId(id));
            legacyStore.set('data', raw);

            const playlist = await setupFresh();
            expect(playlist.getStatus()).toBe('ready');
            const detail = await playlist.loadLocalPlaylist(id);
            expect(detail).toMatchObject({
                musicCount: items.length,
                artwork: 'cover.jpg',
                musicList: JSON.parse(raw),
            });
            expect(legacyStore.getString('data')).toBe(raw);
            expect(
                getStoreVersion(getOrCreateMMKV(PLAYLIST_INDEX_STORE_ID)),
            ).toBe(1);

            const reloaded = await setupFresh();
            await expect(reloaded.loadLocalPlaylist(id)).resolves.toEqual(
                detail,
            );
        },
    );

    it('混合曲目批量加入新歌单：结果、发布详情与落盘一致', async () => {
        const playlist = await setupFresh();
        const id = await playlist.createLocalPlaylist({ title: 'New' });
        await expect(
            playlist.addMusicToLocalPlaylist(id, items),
        ).resolves.toEqual({ added: items.length, duplicates: 0, invalid: 0 });

        const detail = atomStore.get(loadedDetailsAtom).get(id);
        expect(detail).toMatchObject({
            musicCount: items.length,
            artwork: 'cover.jpg',
            musicList: items,
        });
        const persisted = JSON.parse(
            getOrCreateMMKV(playlistStoreId(id)).getString('data')!,
        ) as PlaylistMusicEntry[];
        expect(persisted.map(it => it.item)).toEqual(
            JSON.parse(JSON.stringify(items)),
        );
        const reloaded = await setupFresh();
        await expect(reloaded.loadLocalPlaylist(id)).resolves.toMatchObject({
            musicCount: items.length,
            artwork: 'cover.jpg',
            musicList: JSON.parse(JSON.stringify(items)),
        });
    });

    it('非字符串封面的歌曲收藏成功，重启后可以取消收藏', async () => {
        const item = items[1]!;
        const playlist = await setupFresh();
        await expect(playlist.toggleFavorite(item)).resolves.toBe(true);
        expect(playlist.isFavorite(item)).toBe(true);
        expect(atomStore.get(loadedDetailsAtom).get('favorite')).toMatchObject({
            musicCount: 1,
            artwork: undefined,
            musicList: [item],
        });

        const reloaded = await setupFresh();
        expect(reloaded.isFavorite(item)).toBe(true);
        await expect(reloaded.toggleFavorite(item)).resolves.toBe(false);
        expect(reloaded.isFavorite(item)).toBe(false);
        expect(
            getOrCreateMMKV(playlistStoreId('favorite')).getString('data'),
        ).toBe('[]');
    });

    it('收藏真正写盘失败时仍拒绝，不改变收藏态', async () => {
        const playlist = await setupFresh();
        const store = getOrCreateMMKV(playlistStoreId('favorite'));
        const before = store.getString('data');
        store.set = () => {
            throw new Error('disk full');
        };
        await expect(playlist.toggleFavorite(items[1]!)).rejects.toMatchObject({
            code: 'PERSISTENCE_FAILED',
        });
        expect(playlist.isFavorite(items[1]!)).toBe(false);
        expect(store.getString('data')).toBe(before);
        expect(
            atomStore.get(loadedDetailsAtom).get('favorite')!.musicCount,
        ).toBe(0);
    });
});

describe('favorite 常驻 + isFavorite / setFavorite', () => {
    it('setup eager 载 favorite，isFavorite O(1) + favoriteKeys 发布', async () => {
        seedIndex([favoriteSummary(), userSummary('a')]);
        seedMusic('favorite', [entry(music('f1'), 100, 0)]);
        const playlist = await setupFresh();
        expect(playlist.isFavorite({ platform: 'p', id: 'f1' })).toBe(true);
        expect(playlist.isFavorite({ platform: 'p', id: 'x' })).toBe(false);
        expect(
            atomStore.get(favoriteKeysAtom).has(JSON.stringify(['p', 'f1'])),
        ).toBe(true);
    });

    it('favorite 曲目损坏：模块仍 ready、isFavorite false、toggleFavorite→StorageDegraded', async () => {
        seedIndex([favoriteSummary()]);
        getOrCreateMMKV(playlistStoreId('favorite')).set('data', '{bad');
        const playlist = await setupFresh();
        expect(playlist.getStatus()).toBe('ready');
        expect(playlist.isFavorite({ platform: 'p', id: 'f1' })).toBe(false);
        await expect(
            playlist.toggleFavorite(music('f1')),
        ).rejects.toMatchObject({ code: 'STORAGE_DEGRADED' });
    });

    it('toggleFavorite 往返翻转并返回翻转后的状态', async () => {
        const playlist = await setupFresh();
        expect(await playlist.toggleFavorite(music('f1'))).toBe(true);
        expect(playlist.isFavorite({ platform: 'p', id: 'f1' })).toBe(true);
        expect(await playlist.toggleFavorite(music('f1'))).toBe(false);
        expect(playlist.isFavorite({ platform: 'p', id: 'f1' })).toBe(false);
    });

    it('toggleFavorite 在队列被占住时连点两次仍翻转两次', async () => {
        const playlist = await setupFresh();
        // 先塞一个未决操作占住串行队列，逼出「读在入队前」才会有的竞态
        let release: () => void = () => {};
        const blocker = new Promise<void>(resolve => {
            release = resolve;
        });
        const pendingClear = playlist.clearLocalPlaylistMusic('favorite');
        const first = blocker.then(() => playlist.toggleFavorite(music('f1')));
        const second = blocker.then(() => playlist.toggleFavorite(music('f1')));
        release();
        await pendingClear;
        expect(await first).toBe(true);
        expect(await second).toBe(false);
        // 两次翻转后回到未收藏，而不是被吃掉一次停在已收藏
        expect(playlist.isFavorite({ platform: 'p', id: 'f1' })).toBe(false);
    });

    it('toggleFavorite 更新 favorite 摘要 musicCount', async () => {
        const playlist = await setupFresh();
        await playlist.toggleFavorite(music('f1'));
        expect(
            playlist.getLocalPlaylists().find(p => p.id === 'favorite')!
                .musicCount,
        ).toBe(1);
    });

    it('subscribeFavoriteChange 收藏变化时触发，退订后不再触发', async () => {
        const playlist = await setupFresh();
        const seen: boolean[] = [];
        const unsubscribe = playlist.subscribeFavoriteChange(() => {
            seen.push(playlist.isFavorite({ platform: 'p', id: 'f1' }));
        });
        await playlist.toggleFavorite(music('f1'));
        await playlist.toggleFavorite(music('f1'));
        expect(seen).toEqual([true, false]);
        unsubscribe();
        await playlist.toggleFavorite(music('f1'));
        expect(seen).toHaveLength(2);
    });

    it('重复加入 favorite 不触发变化通知', async () => {
        const playlist = await setupFresh();
        await playlist.toggleFavorite(music('f1'));
        const listener = jest.fn();
        playlist.subscribeFavoriteChange(listener);
        // 已在歌单里，通用的加入操作 added=0、不写盘，故无变化通知
        const { added } = await playlist.addMusicToLocalPlaylist('favorite', [
            music('f1'),
        ]);
        expect(added).toBe(0);
        expect(listener).not.toHaveBeenCalled();
    });
});

describe('loadLocalPlaylist', () => {
    it('懒加载返回详情（musicList + sortMode）', async () => {
        seedIndex([favoriteSummary(), userSummary('a')]);
        seedMusic('a', [entry(music('m1'), 100, 0)]);
        getOrCreateMMKV(playlistStoreId('a')).set('meta.sort', 'addedAtDesc');
        const playlist = await setupFresh();
        const detail = await playlist.loadLocalPlaylist('a');
        expect(detail!.musicList.map(m => m.id)).toEqual(['m1']);
        expect(detail!.sortMode).toBe('addedAtDesc');
    });

    it('不存在 → null', async () => {
        const playlist = await setupFresh();
        expect(await playlist.loadLocalPlaylist('missing')).toBeNull();
    });

    it('曲目损坏 → reject（局部化，模块仍 ready）', async () => {
        seedIndex([favoriteSummary(), userSummary('a')]);
        getOrCreateMMKV(playlistStoreId('a')).set('data', '{bad');
        const playlist = await setupFresh();
        await expect(playlist.loadLocalPlaylist('a')).rejects.toMatchObject({
            code: 'PERSISTENCE_FAILED',
        });
        expect(playlist.getStatus()).toBe('ready');
    });

    it('无存储排序时取 config 默认', async () => {
        seedIndex([favoriteSummary(), userSummary('a')]);
        seedMusic('a', [entry(music('m1'), 100, 0)]);
        (config.get as unknown as jest.Mock).mockReturnValue('title');
        const playlist = await setupFresh();
        const detail = await playlist.loadLocalPlaylist('a');
        expect(detail!.sortMode).toBe('title');
    });

    it('config 默认排序为遗留/损坏值时回落 manual', async () => {
        seedIndex([favoriteSummary(), userSummary('a')]);
        seedMusic('a', [entry(music('m1'), 100, 0)]);
        // 'time' 是 legacy wire 值，不在新值域内
        (config.get as unknown as jest.Mock).mockReturnValue('time');
        const playlist = await setupFresh();
        const detail = await playlist.loadLocalPlaylist('a');
        expect(detail!.sortMode).toBe('manual');
    });

    it('发布 loadedDetails atom', async () => {
        seedIndex([favoriteSummary(), userSummary('a')]);
        seedMusic('a', [entry(music('m1'), 100, 0)]);
        const playlist = await setupFresh();
        await playlist.loadLocalPlaylist('a');
        expect(atomStore.get(loadedDetailsAtom).has('a')).toBe(true);
    });
});

describe('歌单内音乐', () => {
    async function withPlaylist(): Promise<Playlist> {
        seedIndex([favoriteSummary(), userSummary('a')]);
        return setupFresh();
    }

    it('add：去重、musicCount + auto artwork 刷新', async () => {
        const playlist = await withPlaylist();
        const result = await playlist.addMusicToLocalPlaylist('a', [
            music('m1', { artwork: 'art1' }),
            music('m1'),
        ]);
        expect(result).toEqual({ added: 1, duplicates: 1, invalid: 0 });
        const summary = playlist.getLocalPlaylists().find(p => p.id === 'a')!;
        expect(summary.musicCount).toBe(1);
        expect(summary.artwork).toBe('art1');
    });

    it('remove / clear', async () => {
        const playlist = await withPlaylist();
        await playlist.addMusicToLocalPlaylist('a', [music('m1'), music('m2')]);
        const removed = await playlist.removeMusicFromLocalPlaylist('a', {
            platform: 'p',
            id: 'm1',
        });
        expect(removed).toEqual({ removed: 1, missing: 0 });
        expect(await playlist.clearLocalPlaylistMusic('a')).toBe(1);
        expect(
            playlist.getLocalPlaylists().find(p => p.id === 'a')!.musicCount,
        ).toBe(0);
    });

    it('reorder：合法切 Manual；非法 → InvalidMusicOrder', async () => {
        const playlist = await withPlaylist();
        await playlist.addMusicToLocalPlaylist('a', [music('m1'), music('m2')]);
        const order: MediaRef[] = [
            { platform: 'p', id: 'm2' },
            { platform: 'p', id: 'm1' },
        ];
        await playlist.reorderLocalPlaylistMusic('a', order);
        const detail = await playlist.loadLocalPlaylist('a');
        expect(detail!.musicList.map(m => m.id)).toEqual(['m2', 'm1']);
        expect(detail!.sortMode).toBe('manual');
        await expect(
            playlist.reorderLocalPlaylistMusic('a', [
                { platform: 'p', id: 'm1' },
            ]),
        ).rejects.toMatchObject({ code: 'INVALID_MUSIC_ORDER' });
    });

    it('setMusic：整体替换成员与顺序、markManualOrder 从非手动切回 Manual', async () => {
        const playlist = await withPlaylist();
        await playlist.addMusicToLocalPlaylist('a', [
            music('m1'),
            music('m2'),
            music('m3'),
        ]);
        // 先切非手动排序，证明 markManualOrder 分支确实把它切回 Manual（而非本就是 Manual）
        await playlist.setLocalPlaylistMusicSortMode(
            'a',
            PlaylistMusicSortMode.Title,
        );
        // 删 m2、m1/m3 换序、标记手动排
        await playlist.setLocalPlaylistMusic('a', [music('m3'), music('m1')], {
            markManualOrder: true,
        });
        const detail = await playlist.loadLocalPlaylist('a');
        expect(detail!.musicList.map(m => m.id)).toEqual(['m3', 'm1']);
        expect(detail!.sortMode).toBe('manual');
    });

    it('setMusic：不标记手动则保持原排序模式', async () => {
        const playlist = await withPlaylist();
        await playlist.addMusicToLocalPlaylist('a', [
            music('m1', { title: 'b' }),
            music('m2', { title: 'a' }),
        ]);
        await playlist.setLocalPlaylistMusicSortMode(
            'a',
            PlaylistMusicSortMode.Title,
        );
        // 只删一首、不标手动 → sortMode 仍 title
        await playlist.setLocalPlaylistMusic('a', [
            music('m1', { title: 'b' }),
        ]);
        const detail = await playlist.loadLocalPlaylist('a');
        expect(detail!.sortMode).toBe('title');
        expect(detail!.musicList.map(m => m.id)).toEqual(['m1']);
    });

    it('setMusic：保留原曲目加入序（AddedAt 按原 addedAt）、meta 用新值', async () => {
        seedIndex([favoriteSummary(), userSummary('a')]);
        seedMusic('a', [
            entry(music('m1'), 100, 0),
            entry(music('m2'), 200, 0),
        ]);
        const playlist = await setupFresh();
        // manual 顺序传成 [m2, m1]、且 m1 带更新的 title；AddedAt 仍按原 addedAt（m1=100 在前），meta 取新值
        await playlist.setLocalPlaylistMusic('a', [
            music('m2'),
            music('m1', { title: 'updated' }),
        ]);
        await playlist.setLocalPlaylistMusicSortMode(
            'a',
            PlaylistMusicSortMode.AddedAt,
        );
        const detail = await playlist.loadLocalPlaylist('a');
        expect(detail!.musicList.map(m => m.id)).toEqual(['m1', 'm2']);
        expect(detail!.musicList.find(m => m.id === 'm1')!.title).toBe(
            'updated',
        );
    });

    it('setMusic：去重保首条、非法项跳过、空数组清空', async () => {
        const playlist = await withPlaylist();
        await playlist.addMusicToLocalPlaylist('a', [music('m1'), music('m2')]);
        await playlist.setLocalPlaylistMusic('a', [
            music('m1', { title: 'first' }),
            music('m1', { title: 'second' }),
            { title: 'no-ref' } as unknown as MusicItem,
            music('m2'),
        ]);
        let detail = await playlist.loadLocalPlaylist('a');
        // 去重保首条（title=first）、无 platform+id 的非法项被跳过
        expect(detail!.musicList.map(m => m.id)).toEqual(['m1', 'm2']);
        expect(detail!.musicList.find(m => m.id === 'm1')!.title).toBe('first');
        // 空数组清空
        await playlist.setLocalPlaylistMusic('a', []);
        detail = await playlist.loadLocalPlaylist('a');
        expect(detail!.musicList).toEqual([]);
    });

    it('setSortMode：按标题排序并持久化 meta.sort', async () => {
        const playlist = await withPlaylist();
        await playlist.addMusicToLocalPlaylist('a', [
            music('m1', { title: 'b' }),
            music('m2', { title: 'a' }),
        ]);
        await playlist.setLocalPlaylistMusicSortMode(
            'a',
            PlaylistMusicSortMode.Title,
        );
        const detail = await playlist.loadLocalPlaylist('a');
        expect(detail!.musicList.map(m => m.id)).toEqual(['m2', 'm1']);
        expect(
            getOrCreateMMKV(playlistStoreId('a')).getString('meta.sort'),
        ).toBe('title');
    });

    it('未知歌单 → LocalPlaylistNotFound', async () => {
        const playlist = await withPlaylist();
        await expect(
            playlist.addMusicToLocalPlaylist('missing', music('m1')),
        ).rejects.toMatchObject({ code: 'LOCAL_PLAYLIST_NOT_FOUND' });
    });

    it('音乐写盘失败 → PersistenceFailed', async () => {
        const playlist = await withPlaylist();
        getOrCreateMMKV(playlistStoreId('a')).set = () => {
            throw new Error('disk full');
        };
        await expect(
            playlist.addMusicToLocalPlaylist('a', music('m1')),
        ).rejects.toMatchObject({ code: 'PERSISTENCE_FAILED' });
    });

    it('摘要缓存写失败：op 仍成功、音乐已存', async () => {
        const playlist = await withPlaylist();
        getOrCreateMMKV(PLAYLIST_INDEX_STORE_ID).set = () => {
            throw new Error('index write fail');
        };
        const result = await playlist.addMusicToLocalPlaylist('a', music('m1'));
        expect(result.added).toBe(1);
        const detail = await playlist.loadLocalPlaylist('a');
        expect(detail!.musicList.map(m => m.id)).toEqual(['m1']);
    });
});

describe('删歌单驱逐缓存', () => {
    it('删除后 loadedDetails 清除', async () => {
        seedIndex([favoriteSummary(), userSummary('a')]);
        seedMusic('a', [entry(music('m1'), 100, 0)]);
        const playlist = await setupFresh();
        await playlist.loadLocalPlaylist('a');
        expect(atomStore.get(loadedDetailsAtom).has('a')).toBe(true);
        await playlist.removeLocalPlaylists(['a']);
        expect(atomStore.get(loadedDetailsAtom).has('a')).toBe(false);
    });
});

describe('P4b 回归', () => {
    it('reorder 后重启仍保持手动序（持久化 manual）', async () => {
        seedIndex([favoriteSummary(), userSummary('a')]);
        seedMusic('a', [
            entry(music('m1', { title: 'b' }), 100, 0),
            entry(music('m2', { title: 'a' }), 100, 1),
        ]);
        getOrCreateMMKV(playlistStoreId('a')).set('meta.sort', 'title');
        const playlist = await setupFresh();
        await playlist.reorderLocalPlaylistMusic('a', [
            { platform: 'p', id: 'm1' },
            { platform: 'p', id: 'm2' },
        ]);
        const reloaded = new Playlist({ config, errorLog });
        await reloaded.setup();
        const detail = await reloaded.loadLocalPlaylist('a');
        expect(detail!.sortMode).toBe('manual');
        expect(detail!.musicList.map(m => m.id)).toEqual(['m1', 'm2']);
    });

    it('已加载歌单改标题后详情 atom 同步', async () => {
        seedIndex([favoriteSummary(), userSummary('a', '旧')]);
        seedMusic('a', [entry(music('m1'), 100, 0)]);
        const playlist = await setupFresh();
        await playlist.loadLocalPlaylist('a');
        await playlist.updateLocalPlaylist('a', { title: '新' });
        expect(atomStore.get(loadedDetailsAtom).get('a')!.title).toBe('新');
    });

    it('favorite 损坏但摘要数量非零：详情 musicCount 当空', async () => {
        seedIndex([{ ...favoriteSummary(), musicCount: 5 }]);
        getOrCreateMMKV(playlistStoreId('favorite')).set('data', '{bad');
        const playlist = await setupFresh();
        const detail = await playlist.loadLocalPlaylist('favorite');
        expect(detail!.musicList).toHaveLength(0);
        expect(detail!.musicCount).toBe(0);
    });

    it('favorite 读盘抛错：setup 仍 resolve、当空、写命令拒', async () => {
        seedIndex([favoriteSummary()]);
        const store = getOrCreateMMKV(playlistStoreId('favorite'));
        store.getString = () => {
            throw new Error('mmkv read fail');
        };
        const playlist = await setupFresh();
        expect(playlist.getStatus()).toBe('ready');
        expect(playlist.isFavorite({ platform: 'p', id: 'x' })).toBe(false);
        await expect(playlist.toggleFavorite(music('x'))).rejects.toMatchObject(
            { code: 'STORAGE_DEGRADED' },
        );
    });

    it('setup 记忆化：多次调用返回同一 Promise、只初始化一次', async () => {
        seedIndex([favoriteSummary(), userSummary('a')]);
        const playlist = new Playlist({ config, errorLog });
        const first = playlist.setup();
        const second = playlist.setup();
        expect(first).toBe(second);
        await first;
        // 二次 setup 不重跑水合：改动底层 index 后再调不生效
        seedIndex([favoriteSummary(), userSummary('a'), userSummary('b')]);
        await playlist.setup();
        expect(playlist.getLocalPlaylists().map(p => p.id)).toEqual([
            'favorite',
            'a',
        ]);
    });
});

describe('串行与持久化', () => {
    it('并发写按序落定、无丢失更新', async () => {
        const playlist = await setupFresh();
        await Promise.all([
            playlist.createLocalPlaylist({ title: 'A' }),
            playlist.createLocalPlaylist({ title: 'B' }),
            playlist.createLocalPlaylist({ title: 'C' }),
        ]);
        expect(playlist.getLocalPlaylists()).toHaveLength(4);
        expect(readPersistedIndex()).toHaveLength(4);
    });

    it('写盘失败 → PersistenceFailed、内存与发布不变', async () => {
        const playlist = await setupFresh();
        const index = getOrCreateMMKV(PLAYLIST_INDEX_STORE_ID);
        index.set = () => {
            throw new Error('disk full');
        };
        await expect(
            playlist.createLocalPlaylist({ title: 'A' }),
        ).rejects.toMatchObject({ code: 'PERSISTENCE_FAILED' });
        expect(playlist.getLocalPlaylists()).toHaveLength(1);
    });
});

function starredPlaylist(
    platform: string,
    id: string,
    over: Partial<PlaylistItemBase> = {},
): PlaylistItemBase {
    return { platform, id, title: `${platform}-${id}`, ...over };
}

function seedStarred(items: unknown[]): void {
    getOrCreateMMKV(STARRED_STORE_ID).set('data', JSON.stringify(items));
}

describe('starred（收藏远程歌单）', () => {
    it('hydrate valid：发布列表 + O(1) 命中', async () => {
        seedIndex([favoriteSummary()]);
        seedStarred([
            starredPlaylist('demo-a', 's1'),
            starredPlaylist('demo-b', 's2'),
        ]);
        const playlist = await setupFresh();
        expect(playlist.getStarredPlaylists().map(p => p.id)).toEqual([
            's1',
            's2',
        ]);
        expect(
            playlist.isPlaylistStarred({ platform: 'demo-a', id: 's1' }),
        ).toBe(true);
        expect(playlist.isPlaylistStarred({ platform: 'x', id: 's1' })).toBe(
            false,
        );
    });

    it('hydrate 缺失：空列表、模块 ready', async () => {
        seedIndex([favoriteSummary()]);
        const playlist = await setupFresh();
        expect(playlist.getStarredPlaylists()).toEqual([]);
        expect(playlist.getStatus()).toBe('ready');
    });

    it('hydrate 损坏：不发布空/不覆盖 raw、命中 false、写 reject', async () => {
        seedIndex([favoriteSummary()]);
        getOrCreateMMKV(STARRED_STORE_ID).set('data', '{ not json');
        const playlist = await setupFresh();
        // starred 损坏不殃及整模块
        expect(playlist.getStatus()).toBe('ready');
        expect(
            playlist.isPlaylistStarred({ platform: 'demo-a', id: 's1' }),
        ).toBe(false);
        await expect(
            playlist.starPlaylist(starredPlaylist('demo-a', 's1')),
        ).rejects.toMatchObject({ code: 'STORAGE_DEGRADED' });
        // 未覆盖损坏 raw
        expect(getOrCreateMMKV(STARRED_STORE_ID).getString('data')).toBe(
            '{ not json',
        );
    });

    it('star：新收藏置顶返回 true；再 star 同一个替换保位返回 false', async () => {
        seedIndex([favoriteSummary()]);
        seedStarred([starredPlaylist('demo-a', 's1')]);
        const playlist = await setupFresh();
        expect(
            await playlist.starPlaylist(starredPlaylist('demo-b', 's2')),
        ).toBe(true);
        expect(playlist.getStarredPlaylists().map(p => p.id)).toEqual([
            's2',
            's1',
        ]);
        expect(
            await playlist.starPlaylist(
                starredPlaylist('demo-a', 's1', { title: '新标题' }),
            ),
        ).toBe(false);
        const list = playlist.getStarredPlaylists();
        expect(list.map(p => p.id)).toEqual(['s2', 's1']);
        expect(list.find(p => p.id === 's1')!.title).toBe('新标题');
    });

    it('star：深拷贝、不保留调用方引用', async () => {
        seedIndex([favoriteSummary()]);
        const playlist = await setupFresh();
        const input = starredPlaylist('demo-a', 's1', { title: '原' });
        await playlist.starPlaylist(input);
        input.title = '外部改动';
        expect(playlist.getStarredPlaylists()[0]!.title).toBe('原');
    });

    it('star：数字 id 归一为字符串', async () => {
        seedIndex([favoriteSummary()]);
        const playlist = await setupFresh();
        await playlist.starPlaylist({
            platform: 'demo-a',
            id: 123,
        } as unknown as PlaylistItemBase);
        expect(playlist.getStarredPlaylists()[0]!.id).toBe('123');
        expect(
            playlist.isPlaylistStarred({ platform: 'demo-a', id: '123' }),
        ).toBe(true);
    });

    it('star：缺 id → InvalidInput', async () => {
        seedIndex([favoriteSummary()]);
        const playlist = await setupFresh();
        await expect(
            playlist.starPlaylist({
                platform: 'demo-a',
            } as unknown as PlaylistItemBase),
        ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    });

    it('star：拒绝本地平台（Local/Starred 互斥）', async () => {
        seedIndex([favoriteSummary()]);
        const playlist = await setupFresh();
        await expect(
            playlist.starPlaylist(starredPlaylist(LOCAL_MEDIA_PLATFORM, 's1')),
        ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    });

    it('unstar：移除返回 true；不存在返回 false', async () => {
        seedIndex([favoriteSummary()]);
        seedStarred([starredPlaylist('demo-a', 's1')]);
        const playlist = await setupFresh();
        expect(
            await playlist.unstarPlaylist({ platform: 'demo-a', id: 's1' }),
        ).toBe(true);
        expect(playlist.getStarredPlaylists()).toEqual([]);
        expect(
            await playlist.unstarPlaylist({ platform: 'demo-a', id: 's1' }),
        ).toBe(false);
    });

    it('unstarPlaylists：批量单次提交，返回实际移除数、未命中跳过', async () => {
        seedIndex([favoriteSummary()]);
        seedStarred([
            starredPlaylist('demo-a', 's1'),
            starredPlaylist('demo-b', 's2'),
            starredPlaylist('demo-c', 's3'),
        ]);
        const playlist = await setupFresh();
        // 含一个不存在的 ref：只计实际命中数，其余照常移除
        expect(
            await playlist.unstarPlaylists([
                { platform: 'demo-a', id: 's1' },
                { platform: 'demo-b', id: 's2' },
                { platform: 'nope', id: 'x' },
            ]),
        ).toBe(2);
        expect(playlist.getStarredPlaylists().map(item => item.id)).toEqual([
            's3',
        ]);
        // 空入参与全未命中都不改动
        expect(await playlist.unstarPlaylists([])).toBe(0);
        expect(
            await playlist.unstarPlaylists([{ platform: 'demo-a', id: 's1' }]),
        ).toBe(0);
        expect(playlist.getStarredPlaylists()).toHaveLength(1);
    });

    it('reorder：合法排列；缺项/重复 → InvalidStarredPlaylistOrder', async () => {
        seedIndex([favoriteSummary()]);
        seedStarred([
            starredPlaylist('demo-a', 's1'),
            starredPlaylist('demo-b', 's2'),
        ]);
        const playlist = await setupFresh();
        await playlist.reorderStarredPlaylists([
            { platform: 'demo-b', id: 's2' },
            { platform: 'demo-a', id: 's1' },
        ]);
        expect(playlist.getStarredPlaylists().map(p => p.id)).toEqual([
            's2',
            's1',
        ]);
        await expect(
            playlist.reorderStarredPlaylists([
                { platform: 'demo-b', id: 's2' },
            ]),
        ).rejects.toMatchObject({ code: 'INVALID_STARRED_PLAYLIST_ORDER' });
        await expect(
            playlist.reorderStarredPlaylists([
                { platform: 'demo-b', id: 's2' },
                { platform: 'demo-b', id: 's2' },
            ]),
        ).rejects.toMatchObject({ code: 'INVALID_STARRED_PLAYLIST_ORDER' });
    });

    it('模块 degraded：starred 写 reject StorageDegraded', async () => {
        seedRawIndex('{ not json');
        seedStarred([starredPlaylist('demo-a', 's1')]);
        const playlist = await setupFresh();
        expect(playlist.getStatus()).toBe('degraded');
        await expect(
            playlist.starPlaylist(starredPlaylist('demo-b', 's2')),
        ).rejects.toMatchObject({ code: 'STORAGE_DEGRADED' });
    });

    it('写盘失败 → PersistenceFailed', async () => {
        seedIndex([favoriteSummary()]);
        const playlist = await setupFresh();
        getOrCreateMMKV(STARRED_STORE_ID).set = () => {
            throw new Error('disk full');
        };
        await expect(
            playlist.starPlaylist(starredPlaylist('demo-a', 's1')),
        ).rejects.toMatchObject({ code: 'PERSISTENCE_FAILED' });
    });

    it('star 后发布 atom 供响应式订阅', async () => {
        seedIndex([favoriteSummary()]);
        const playlist = await setupFresh();
        await playlist.starPlaylist(starredPlaylist('demo-a', 's1'));
        expect(atomStore.get(starredPlaylistsAtom).map(p => p.id)).toEqual([
            's1',
        ]);
        expect(atomStore.get(starredKeysAtom).size).toBe(1);
    });

    it('hydrate 含本地平台项：视为损坏、不发布、写 reject', async () => {
        seedIndex([favoriteSummary()]);
        seedStarred([starredPlaylist(LOCAL_MEDIA_PLATFORM, 's1')]);
        const playlist = await setupFresh();
        expect(playlist.getStatus()).toBe('ready');
        expect(playlist.getStarredPlaylists()).toEqual([]);
        await expect(
            playlist.starPlaylist(starredPlaylist('demo-a', 's2')),
        ).rejects.toMatchObject({ code: 'STORAGE_DEGRADED' });
    });

    it('hydrate 重复身份：视为损坏、不发布', async () => {
        seedIndex([favoriteSummary()]);
        seedStarred([
            starredPlaylist('demo-a', 's1'),
            starredPlaylist('demo-a', 's1'),
        ]);
        const playlist = await setupFresh();
        expect(playlist.getStarredPlaylists()).toEqual([]);
        expect(
            playlist.isPlaylistStarred({ platform: 'demo-a', id: 's1' }),
        ).toBe(false);
    });

    it('发布的快照被冻结、外部不可原地改动', async () => {
        seedIndex([favoriteSummary()]);
        seedStarred([starredPlaylist('demo-a', 's1')]);
        const playlist = await setupFresh();
        const list = playlist.getStarredPlaylists();
        expect(list).toHaveLength(1);
        expect(Object.isFrozen(list)).toBe(true);
        expect(Object.isFrozen(list[0])).toBe(true);
    });
});

describe('备份传输：快照', () => {
    it('snapshotLocalPlaylists：favorite 居首，携带 title/description/createdAt/sortMode', async () => {
        seedIndex([
            favoriteSummary(),
            {
                id: 'a',
                kind: 'user',
                title: '甲歌单',
                description: '描述',
                hasCustomArtwork: false,
                musicCount: 1,
                createdAt: 12345,
            },
        ]);
        seedMusic('a', [entry(music('x'), 100, 0)]);
        getOrCreateMMKV(playlistStoreId('a')).set(
            'meta.sort',
            PlaylistMusicSortMode.Title,
        );
        const playlist = await setupFresh();
        const snap = await playlist.snapshotLocalPlaylists();
        expect(snap.map(p => p.id)).toEqual(['favorite', 'a']);
        const a = snap.find(p => p.id === 'a')!;
        expect(a.title).toBe('甲歌单');
        expect(a.description).toBe('描述');
        expect(a.createdAt).toBe(12345);
        expect(a.sortMode).toBe(PlaylistMusicSortMode.Title);
    });

    it('snapshotLocalPlaylists：musicList 按 manual(entries) 顺序，不受展示 sortMode 影响', async () => {
        seedIndex([favoriteSummary(), userSummary('a')]);
        // entries manual 顺序 z→m；展示 sortMode=Title 会把 m(Aaa) 排前，但快照须为 manual
        seedMusic('a', [
            entry(music('z', { title: 'Zzz' }), 1, 0),
            entry(music('m', { title: 'Aaa' }), 1, 1),
        ]);
        getOrCreateMMKV(playlistStoreId('a')).set(
            'meta.sort',
            PlaylistMusicSortMode.Title,
        );
        const playlist = await setupFresh();
        const snap = await playlist.snapshotLocalPlaylists();
        const a = snap.find(p => p.id === 'a')!;
        expect(a.musicList.map(m => m.id)).toEqual(['z', 'm']);
    });

    it('snapshotLocalPlaylists：跑在写串行链之后（pending 写完成才快照）', async () => {
        const playlist = await setupFresh();
        // 不先 await create：让 snapshot 排在其后入队，验证跑在 pending 写之后
        const created = playlist.createLocalPlaylist({ title: '新' });
        const snap = await playlist.snapshotLocalPlaylists();
        await created;
        expect(snap).toHaveLength(2);
        expect(snap[0]!.id).toBe('favorite');
        expect(snap[1]!.title).toBe('新');
    });

    it('snapshotLocalPlaylists：index degraded → StorageDegraded', async () => {
        seedRawIndex('{ not json');
        const playlist = await setupFresh();
        await expect(playlist.snapshotLocalPlaylists()).rejects.toMatchObject({
            code: 'STORAGE_DEGRADED',
        });
    });

    it('snapshotLocalPlaylists：favorite 损坏 → StorageDegraded', async () => {
        seedIndex([favoriteSummary()]);
        getOrCreateMMKV(playlistStoreId('favorite')).set('data', '{ not json');
        const playlist = await setupFresh();
        await expect(playlist.snapshotLocalPlaylists()).rejects.toMatchObject({
            code: 'STORAGE_DEGRADED',
        });
    });

    it('snapshotLocalPlaylists：普通歌单音乐损坏 → PersistenceFailed', async () => {
        seedIndex([favoriteSummary(), userSummary('a')]);
        getOrCreateMMKV(playlistStoreId('a')).set('data', '{ not json');
        const playlist = await setupFresh();
        await expect(playlist.snapshotLocalPlaylists()).rejects.toMatchObject({
            code: 'PERSISTENCE_FAILED',
        });
    });

    it('snapshotStarredPlaylists：返回全部收藏（含内嵌 musicList）', async () => {
        seedIndex([favoriteSummary()]);
        seedStarred([
            starredPlaylist('srcA', 's1'),
            {
                platform: 'srcB',
                id: 's2',
                title: 'srcB-s2',
                musicList: [music('x')],
            },
        ]);
        const playlist = await setupFresh();
        const snap = await playlist.snapshotStarredPlaylists();
        expect(snap.map(p => p.id)).toEqual(['s1', 's2']);
        expect(snap[1]!.musicList!.map(m => m.id)).toEqual(['x']);
    });

    it('snapshotStarredPlaylists：starred 损坏 → StorageDegraded', async () => {
        seedIndex([favoriteSummary()]);
        getOrCreateMMKV(STARRED_STORE_ID).set('data', '{ not json');
        const playlist = await setupFresh();
        await expect(playlist.snapshotStarredPlaylists()).rejects.toMatchObject(
            { code: 'STORAGE_DEGRADED' },
        );
    });

    it('snapshotStarredPlaylists：返回快照递归冻结', async () => {
        seedIndex([favoriteSummary()]);
        seedStarred([starredPlaylist('srcA', 's1')]);
        const playlist = await setupFresh();
        const snap = await playlist.snapshotStarredPlaylists();
        expect(Object.isFrozen(snap)).toBe(true);
        expect(Object.isFrozen(snap[0])).toBe(true);
    });
});

describe('备份传输：恢复普通歌单', () => {
    it('append：favorite 合曲前插、其余各建新歌单、保留现有', async () => {
        seedIndex([favoriteSummary(), userSummary('u1', '现有歌单')]);
        seedMusic('favorite', [entry(music('old'), 100, 0)]);
        seedMusic('u1', [entry(music('b'), 100, 0)]);
        const playlist = await setupFresh();

        const result = await playlist.restoreLocalPlaylists(
            [
                localTransfer('favorite', {
                    musicList: [music('new1'), music('new2')],
                }),
                localTransfer('src-a', {
                    title: '备份歌单甲',
                    musicList: [music('x')],
                }),
            ],
            'append',
        );

        expect(result.localPlaylistsCreated).toBe(1);
        expect(result.musicAdded).toBe(3);
        const snap = await playlist.snapshotLocalPlaylists();
        // 新建歌单前插在 favorite 之后、现有之前
        expect(snap.map(p => p.title)).toEqual(['', '备份歌单甲', '现有歌单']);
        // favorite 合曲：备份曲目前插（最近加入在前）
        const fav = snap.find(p => p.id === 'favorite')!;
        expect(fav.musicList.map(m => m.id)).toEqual(['new1', 'new2', 'old']);
    });

    it('append：favorite 合曲按 (platform,id) 去重、计 duplicates', async () => {
        seedIndex([favoriteSummary()]);
        seedMusic('favorite', [entry(music('dup'), 100, 0)]);
        const playlist = await setupFresh();

        const result = await playlist.restoreLocalPlaylists(
            [
                localTransfer('favorite', {
                    musicList: [music('dup'), music('fresh')],
                }),
            ],
            'append',
        );

        expect(result.musicAdded).toBe(1);
        expect(result.musicDuplicatesSkipped).toBe(1);
        const snap = await playlist.snapshotLocalPlaylists();
        const fav = snap.find(p => p.id === 'favorite')!;
        expect(fav.musicList.map(m => m.id)).toEqual(['fresh', 'dup']);
    });

    it('append：新建歌单沿用备份 sortMode', async () => {
        seedIndex([favoriteSummary()]);
        const playlist = await setupFresh();

        await playlist.restoreLocalPlaylists(
            [
                localTransfer('src-a', {
                    title: '甲',
                    sortMode: PlaylistMusicSortMode.Title,
                    musicList: [music('x')],
                }),
            ],
            'append',
        );

        const snap = await playlist.snapshotLocalPlaylists();
        expect(snap.find(p => p.title === '甲')!.sortMode).toBe(
            PlaylistMusicSortMode.Title,
        );
    });

    it('overwrite：整体替换、favorite 从空重建、旧歌单被删', async () => {
        seedIndex([favoriteSummary(), userSummary('u1'), userSummary('u2')]);
        seedMusic('favorite', [entry(music('old-fav'), 100, 0)]);
        seedMusic('u1', [entry(music('b'), 100, 0)]);
        const playlist = await setupFresh();

        const result = await playlist.restoreLocalPlaylists(
            [
                localTransfer('favorite', { musicList: [music('nf')] }),
                localTransfer('src-a', {
                    title: '甲',
                    musicList: [music('x')],
                }),
            ],
            'overwrite',
        );

        expect(result.localPlaylistsCreated).toBe(1);
        const snap = await playlist.snapshotLocalPlaylists();
        // 旧 u1/u2 消失；favorite 只剩 nf（old-fav 被丢弃）
        expect(snap.map(p => p.title)).toEqual(['', '甲']);
        expect(
            snap.find(p => p.id === 'favorite')!.musicList.map(m => m.id),
        ).toEqual(['nf']);
        // 旧普通歌单 store 已清
        expect(
            getOrCreateMMKV(playlistStoreId('u1')).getString('data'),
        ).toBeUndefined();
    });

    it('append：index degraded → StorageDegraded', async () => {
        seedRawIndex('{ not json');
        const playlist = await setupFresh();
        await expect(
            playlist.restoreLocalPlaylists(
                [localTransfer('favorite', { musicList: [music('x')] })],
                'append',
            ),
        ).rejects.toMatchObject({ code: 'STORAGE_DEGRADED' });
    });

    it('append：favorite 损坏 → StorageDegraded', async () => {
        seedIndex([favoriteSummary()]);
        getOrCreateMMKV(playlistStoreId('favorite')).set('data', '{ not json');
        const playlist = await setupFresh();
        await expect(
            playlist.restoreLocalPlaylists(
                [localTransfer('favorite', { musicList: [music('x')] })],
                'append',
            ),
        ).rejects.toMatchObject({ code: 'STORAGE_DEGRADED' });
    });

    it('overwrite：degraded 也放行、写成功后恢复 ready', async () => {
        seedRawIndex('{ not json');
        const playlist = await setupFresh();
        expect(playlist.getStatus()).toBe('degraded');

        const result = await playlist.restoreLocalPlaylists(
            [
                localTransfer('favorite', { musicList: [music('x')] }),
                localTransfer('src-a', {
                    title: '甲',
                    musicList: [music('y')],
                }),
            ],
            'overwrite',
        );

        expect(result.localPlaylistsCreated).toBe(1);
        expect(playlist.getStatus()).toBe('ready');
        const snap = await playlist.snapshotLocalPlaylists();
        expect(snap.map(p => p.title)).toEqual(['', '甲']);
        // 数据损坏型 degraded：$version 本就最新、restore 不动它 → 恢复跨重启粘住
        expect(getStoreVersion(getOrCreateMMKV(PLAYLIST_INDEX_STORE_ID))).toBe(
            1,
        );
        const restarted = new Playlist({ config, errorLog });
        await restarted.setup();
        expect(restarted.getStatus()).toBe('ready');
        expect(restarted.getLocalPlaylists().map(p => p.title)).toEqual([
            '',
            '甲',
        ]);
    });

    it('更新已发布读模型（getLocalPlaylists / isFavorite）', async () => {
        seedIndex([favoriteSummary()]);
        const playlist = await setupFresh();

        await playlist.restoreLocalPlaylists(
            [
                localTransfer('favorite', { musicList: [music('f')] }),
                localTransfer('src-a', {
                    title: '甲',
                    musicList: [music('x')],
                }),
            ],
            'append',
        );

        expect(playlist.getLocalPlaylists().map(p => p.title)).toEqual([
            '',
            '甲',
        ]);
        expect(
            playlist.getLocalPlaylists().find(p => p.id === 'favorite')!
                .musicCount,
        ).toBe(1);
        expect(playlist.isFavorite({ platform: 'p', id: 'f' })).toBe(true);
    });

    it('append：保留现有 favorite 的 description 与自定义封面（不被备份覆盖）', async () => {
        seedIndex([
            {
                id: 'favorite',
                kind: 'favorite',
                title: '',
                description: '我的收藏',
                artwork: 'file:///custom.png',
                hasCustomArtwork: true,
                musicCount: 1,
                createdAt: 7,
            },
        ]);
        seedMusic('favorite', [entry(music('old'), 100, 0)]);
        const playlist = await setupFresh();

        await playlist.restoreLocalPlaylists(
            [
                localTransfer('favorite', {
                    description: '备份描述',
                    musicList: [music('new')],
                }),
            ],
            'append',
        );

        const fav = playlist
            .getLocalPlaylists()
            .find(p => p.id === 'favorite')!;
        expect(fav.description).toBe('我的收藏');
        expect(fav.hasCustomArtwork).toBe(true);
        expect(fav.artwork).toBe('file:///custom.png');
        expect(fav.musicCount).toBe(2);
    });

    it('overwrite：favorite 取备份 description/createdAt、清自定义封面文件', async () => {
        seedIndex([
            {
                id: 'favorite',
                kind: 'favorite',
                title: '',
                description: '旧描述',
                artwork: 'file:///old.png',
                hasCustomArtwork: true,
                musicCount: 1,
                createdAt: 7,
            },
        ]);
        seedMusic('favorite', [entry(music('old'), 100, 0)]);
        const playlist = await setupFresh();

        await playlist.restoreLocalPlaylists(
            [
                localTransfer('favorite', {
                    description: '备份描述',
                    createdAt: 999,
                    musicList: [music('nf')],
                }),
            ],
            'overwrite',
        );

        const fav = playlist
            .getLocalPlaylists()
            .find(p => p.id === 'favorite')!;
        expect(fav.description).toBe('备份描述');
        expect(fav.hasCustomArtwork).toBe(false);
        expect(fav.createdAt).toBe(999);
        expect(mockRemove).toHaveBeenCalledWith('file:///old.png');
    });

    it('append：保留现有歌单的已载详情缓存（后续摘要更新仍刷新详情）', async () => {
        seedIndex([favoriteSummary(), userSummary('u1', '现有')]);
        seedMusic('u1', [entry(music('b'), 100, 0)]);
        const playlist = await setupFresh();
        await playlist.loadLocalPlaylist('u1');

        await playlist.restoreLocalPlaylists(
            [localTransfer('src-a', { title: '甲', musicList: [music('x')] })],
            'append',
        );
        // append 不应清掉现有歌单缓存：改标题时详情读模型仍能刷新
        await playlist.updateLocalPlaylist('u1', { title: '改后' });

        expect(atomStore.get(loadedDetailsAtom).get('u1')?.title).toBe('改后');
    });

    it('overwrite：迁移失败型 degraded 也放行，但不碰迁移版本（不误宣称迁移完成、不跳 starred 导入）', async () => {
        // legacy 索引损坏 → 迁移抛错 → degraded 且 $version 停在 0
        getOrCreateMMKV(LEGACY_INDEX_STORE_ID).set('data', '{"not":"array"}');
        const playlist = await setupFresh();
        expect(playlist.getStatus()).toBe('degraded');

        await playlist.restoreLocalPlaylists(
            [localTransfer('favorite', { musicList: [music('x')] })],
            'overwrite',
        );

        // 本次会话内写入生效
        expect(playlist.getStatus()).toBe('ready');
        expect(playlist.isFavorite({ platform: 'p', id: 'x' })).toBe(true);
        // restore 不改写迁移版本戳（否则会误宣称迁移完成、跳过从未跑过的 starred 导入）
        expect(getStoreVersion(getOrCreateMMKV(PLAYLIST_INDEX_STORE_ID))).toBe(
            0,
        );
        // 迁移仍未完成：重启重跑迁移（本例仍损坏 → 仍 degraded），恢复不跨重启粘住、但 legacy 不丢
        const restarted = new Playlist({ config, errorLog });
        await restarted.setup();
        expect(restarted.getStatus()).toBe('degraded');
    });
});

describe('备份传输：恢复收藏', () => {
    it('append：新收藏前插、按 (platform,id) 去重、非法项跳过计数', async () => {
        seedIndex([favoriteSummary()]);
        seedStarred([starredPlaylist('srcA', 's1')]);
        const playlist = await setupFresh();

        const result = await playlist.restoreStarredPlaylists(
            [
                starredPlaylist('srcA', 's1'), // 已收藏 → skip
                starredPlaylist('srcB', 's2'), // 新 → 前插
                starredPlaylist(LOCAL_MEDIA_PLATFORM, 'x'), // 本地平台非法 → skip
            ],
            'append',
        );

        expect(result.starredAdded).toBe(1);
        expect(result.starredSkipped).toBe(2);
        // 新项前插：s2 在 s1 之前
        expect(playlist.getStarredPlaylists().map(p => p.id)).toEqual([
            's2',
            's1',
        ]);
    });

    it('overwrite：整体替换全部收藏', async () => {
        seedIndex([favoriteSummary()]);
        seedStarred([
            starredPlaylist('srcA', 's1'),
            starredPlaylist('srcB', 's2'),
        ]);
        const playlist = await setupFresh();

        const result = await playlist.restoreStarredPlaylists(
            [starredPlaylist('srcC', 's3')],
            'overwrite',
        );

        expect(result.starredAdded).toBe(1);
        expect(playlist.getStarredPlaylists().map(p => p.id)).toEqual(['s3']);
        expect(playlist.isPlaylistStarred({ platform: 'srcA', id: 's1' })).toBe(
            false,
        );
    });

    it('overwrite：从 starred 存储损坏中恢复（清除 #starredCorrupt）', async () => {
        seedIndex([favoriteSummary()]);
        getOrCreateMMKV(STARRED_STORE_ID).set('data', '{ not json');
        const playlist = await setupFresh();
        // index 正常 → 模块 ready；仅 starred 损坏
        expect(playlist.getStatus()).toBe('ready');

        const result = await playlist.restoreStarredPlaylists(
            [starredPlaylist('srcA', 's1')],
            'overwrite',
        );

        expect(result.starredAdded).toBe(1);
        expect(playlist.getStarredPlaylists().map(p => p.id)).toEqual(['s1']);
        // 损坏标记已清 → 后续正常写不再被拒
        expect(await playlist.starPlaylist(starredPlaylist('srcB', 's2'))).toBe(
            true,
        );
    });

    it('append：starred 损坏 → StorageDegraded（不能合并进不可信底）', async () => {
        seedIndex([favoriteSummary()]);
        getOrCreateMMKV(STARRED_STORE_ID).set('data', '{ not json');
        const playlist = await setupFresh();

        await expect(
            playlist.restoreStarredPlaylists(
                [starredPlaylist('srcA', 's1')],
                'append',
            ),
        ).rejects.toMatchObject({ code: 'STORAGE_DEGRADED' });
    });

    it('模块 degraded 时两种模式都拒绝（starred 恢复修不了 index-degraded）', async () => {
        seedRawIndex('{ not json');
        const playlist = await setupFresh();
        expect(playlist.getStatus()).toBe('degraded');

        await expect(
            playlist.restoreStarredPlaylists(
                [starredPlaylist('srcA', 's1')],
                'overwrite',
            ),
        ).rejects.toMatchObject({ code: 'STORAGE_DEGRADED' });
        await expect(
            playlist.restoreStarredPlaylists(
                [starredPlaylist('srcA', 's1')],
                'append',
            ),
        ).rejects.toMatchObject({ code: 'STORAGE_DEGRADED' });
    });

    it('保留内嵌 musicList、更新已发布读模型', async () => {
        seedIndex([favoriteSummary()]);
        const playlist = await setupFresh();

        await playlist.restoreStarredPlaylists(
            [
                {
                    platform: 'srcA',
                    id: 's1',
                    title: 'srcA-s1',
                    musicList: [music('m1')],
                },
            ],
            'overwrite',
        );

        const list = playlist.getStarredPlaylists();
        expect(list[0]!.musicList!.map(m => m.id)).toEqual(['m1']);
        expect(playlist.isPlaylistStarred({ platform: 'srcA', id: 's1' })).toBe(
            true,
        );
    });

    it('append：输入批内重复跳过、新块内保持输入顺序', async () => {
        seedIndex([favoriteSummary()]);
        seedStarred([starredPlaylist('srcA', 's1')]);
        const playlist = await setupFresh();

        const result = await playlist.restoreStarredPlaylists(
            [
                starredPlaylist('srcB', 's2'),
                starredPlaylist('srcC', 's3'),
                starredPlaylist('srcB', 's2'), // 输入批内重复 → skip
            ],
            'append',
        );

        expect(result.starredAdded).toBe(2);
        expect(result.starredSkipped).toBe(1);
        // 新块前插、块内保输入序：s2, s3, 再现有 s1
        expect(playlist.getStarredPlaylists().map(p => p.id)).toEqual([
            's2',
            's3',
            's1',
        ]);
    });

    it('append：无新增（全已收藏 / 空输入）时不写盘', async () => {
        seedIndex([favoriteSummary()]);
        seedStarred([starredPlaylist('srcA', 's1')]);
        const playlist = await setupFresh();
        // 令 starred store 写入抛错：若 no-op 仍写盘会 PersistenceFailed
        getOrCreateMMKV(STARRED_STORE_ID).set = () => {
            throw new Error('disk full');
        };

        expect(
            await playlist.restoreStarredPlaylists(
                [starredPlaylist('srcA', 's1')], // 全已收藏
                'append',
            ),
        ).toEqual({ starredAdded: 0, starredSkipped: 1 });
        expect(await playlist.restoreStarredPlaylists([], 'append')).toEqual({
            starredAdded: 0,
            starredSkipped: 0,
        });
    });

    it('overwrite：写盘失败 → PersistenceFailed，损坏标记不清、读模型不变', async () => {
        seedIndex([favoriteSummary()]);
        getOrCreateMMKV(STARRED_STORE_ID).set('data', '{ not json');
        const playlist = await setupFresh();
        getOrCreateMMKV(STARRED_STORE_ID).set = () => {
            throw new Error('disk full');
        };

        await expect(
            playlist.restoreStarredPlaylists(
                [starredPlaylist('srcA', 's1')],
                'overwrite',
            ),
        ).rejects.toMatchObject({ code: 'PERSISTENCE_FAILED' });
        expect(playlist.getStarredPlaylists()).toHaveLength(0);
        // 损坏标记未清 → 后续普通写仍被拒
        await expect(
            playlist.starPlaylist(starredPlaylist('srcB', 's2')),
        ).rejects.toMatchObject({ code: 'STORAGE_DEGRADED' });
    });
});
