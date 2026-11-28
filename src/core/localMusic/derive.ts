/**
 * 本地库视图派生：从 library（path 索引）算曲目排序列表 / 集合概览 / 集合曲目
 * 按 library 引用建一次派生索引（反向成员 + 各视图/排序结果懒缓存），命令式 getter 与 hooks 共用同份缓存
 * library 引用扫描完才换 → WeakMap 天然失效；语义纯（同 library 同结果），缓存只是 memoization、无外部副作用
 * 排序键 addedAt 取自 files.addedAt、其余取自 musicByPath；反向索引省集合详情全库扫描
 */
import { mediaKey } from '@/utils/media';

import type {
    LocalCollection,
    LocalCollectionView,
    LocalLibrary,
    LocalSort,
    LocalSortBy,
} from './types';
import type { MediaRef, MusicItem } from '@/types';

/** 复用 collator：大小写/变音不敏感 + 数字自然序，比逐次 localeCompare 省创建开销；Intl 不可用则回退 */
const compareText: (a: string, b: string) => number =
    typeof Intl !== 'undefined' && typeof Intl.Collator === 'function'
        ? new Intl.Collator(undefined, {
              sensitivity: 'base',
              numeric: true,
          }).compare
        : (a, b) => a.localeCompare(b);

/** 共享冻结空曲目列表：无效集合 key 时复用、不写缓存 */
const EMPTY_MUSIC: readonly MusicItem[] = Object.freeze([]);

/** 专辑复合 key（album + albumArtist）；JSON 元组编码无碰撞（标签可能含 NUL），派生与 getCollectionMusic 匹配共用 */
function albumKey(album: string, albumArtist: string): string {
    return JSON.stringify([album, albumArtist]);
}

/** 目录展示名：canonical 路径末段（根/空回退原串） */
function folderName(folderPath: string): string {
    const segments = folderPath.split('/').filter(Boolean);
    return segments[segments.length - 1] ?? folderPath;
}

type SortValue = string | number | undefined;

/** 排序行：decorate 预取排序值，避免比较器内重复查 library（省 N log N 次查找） */
interface SortRow {
    item: MusicItem;
    value: SortValue;
}

/** 提取排序值；时长非正数或非有限值表示未知 */
function sortValue(
    item: MusicItem,
    addedAt: number | undefined,
    by: LocalSortBy,
): SortValue {
    switch (by) {
        case 'title':
            return typeof item.title === 'string' ? item.title : '';
        case 'artist':
            return typeof item.artist === 'string' ? item.artist : '';
        case 'addedAt':
            return Number.isFinite(addedAt) ? addedAt : undefined;
        case 'duration':
            return Number.isFinite(item.duration) && item.duration > 0
                ? item.duration
                : undefined;
    }
}

/** 统一比较排序值；缺失值不参与方向翻转，始终置于有效值之后 */
function compareSortValues(a: SortValue, b: SortValue, desc: boolean): number {
    if (a === undefined || b === undefined) {
        if (a === b) return 0;
        return a === undefined ? 1 : -1;
    }
    const compared =
        typeof a === 'number' && typeof b === 'number'
            ? a - b
            : typeof a === 'string' && typeof b === 'string'
            ? compareText(a, b)
            : typeof a === 'number'
            ? -1
            : 1;
    return (desc ? -1 : 1) * compared;
}

/** 按 sort 排序给定 path 集合 → 冻结 MusicItem[]（decorate-sort-undecorate；path 均已知存于 musicByPath） */
function sortedItemsForPaths(
    library: LocalLibrary,
    paths: readonly string[],
    sort: LocalSort,
): readonly MusicItem[] {
    const rows: SortRow[] = [];
    for (const path of paths) {
        const item = library.musicByPath[path];
        if (item) {
            rows.push({
                item,
                value: sortValue(item, library.files[path]?.addedAt, sort.by),
            });
        }
    }
    rows.sort((a, b) => compareSortValues(a.value, b.value, sort.desc));
    return Object.freeze(rows.map(row => row.item));
}

/** 某 library 快照的派生索引：一次 O(N) 建反向成员，视图/排序结果懒填缓存 */
interface DerivedIndex {
    /** folderPath → 成员 path + 代表封面 ref（首个有内嵌封面成员） */
    byFolder: Map<string, { paths: string[]; coverRef?: MediaRef }>;
    /** albumKey → 展示字段 + 成员 path + 代表封面 ref */
    byAlbum: Map<
        string,
        {
            album: string;
            albumArtist: string;
            paths: string[];
            coverRef?: MediaRef;
        }
    >;
    /** artist → distinct albumKey + 成员 path + 代表封面 ref */
    byArtist: Map<
        string,
        { albums: Set<string>; paths: string[]; coverRef?: MediaRef }
    >;
    /** mediaKey(platform+id) → **代表 path**（同一首歌可能有多份文件，只有一份代表它） */
    byRef: Map<string, string>;
    /** 确有多份文件的身份 → 其代表 path；正常为空 */
    duplicated: Map<string, string>;
    /** 集合概览缓存（按视图懒填、冻结） */
    collections: Map<LocalCollectionView, readonly LocalCollection[]>;
    /** 全部曲目排序缓存（按 sortKey 懒填、冻结） */
    sortedAll: Map<string, readonly MusicItem[]>;
    /** 集合曲目排序缓存（按 view+key+sortKey 懒填、冻结） */
    sortedMembers: Map<string, readonly MusicItem[]>;
}

/** 按 library 引用缓存派生索引；library 换新引用（扫描完）即自动失效、旧条目随 GC 回收 */
const indexCache = new WeakMap<LocalLibrary, DerivedIndex>();

/**
 * 同一首歌的多个文件副本里挑代表：体积大者优先（≈音质高），并列时路径升序
 *
 * 必须确定性：代表若随遍历顺序漂移，列表行、`pathByRef` 反查与播放锚点会各指向一份不同的文件
 */
function isBetterCopy(
    library: LocalLibrary,
    candidate: string,
    held: string,
): boolean {
    const size = library.files[candidate]?.sizeBytes ?? 0;
    const heldSize = library.files[held]?.sizeBytes ?? 0;
    return size === heldSize ? candidate < held : size > heldSize;
}

/**
 * 一次遍历 musicByPath 建反向成员索引
 *
 * 库按 path 忠实存储（同一首歌可能有多份文件：多档音质、或用户自己复制的副本），
 * 「每首歌只显示一行」是视图规则，故在此挑代表——而不是在写入时丢弃副本。
 * 写入时丢弃会让副本连 `MusicItem` 都没存下，代表文件一旦消失，这首歌就再也无法从库里恢复
 */
function buildIndex(library: LocalLibrary): DerivedIndex {
    const byRef = new Map<string, string>();
    const copies = new Map<string, number>();
    for (const [path, item] of Object.entries(library.musicByPath)) {
        const key = mediaKey(item);
        copies.set(key, (copies.get(key) ?? 0) + 1);
        const held = byRef.get(key);
        if (held === undefined || isBetterCopy(library, path, held)) {
            byRef.set(key, path);
        }
    }
    const duplicated = new Map<string, string>();
    for (const [key, path] of byRef) {
        if ((copies.get(key) ?? 0) > 1) {
            duplicated.set(key, path);
        }
    }

    const byFolder = new Map<
        string,
        { paths: string[]; coverRef?: MediaRef }
    >();
    const byAlbum = new Map<
        string,
        {
            album: string;
            albumArtist: string;
            paths: string[];
            coverRef?: MediaRef;
        }
    >();
    const byArtist = new Map<
        string,
        { albums: Set<string>; paths: string[]; coverRef?: MediaRef }
    >();
    // 只用代表路径建集合：副本不额外占行，也不让同一首歌在两个文件夹里各算一次
    for (const path of byRef.values()) {
        const item = library.musicByPath[path];
        if (!item) continue;
        const meta = library.files[path];
        const folder = meta?.folderPath ?? '';
        const albumArtist = meta?.albumArtist ?? item.artist;
        const aKey = albumKey(item.album, albumArtist);
        // 集合代表封面：取首个有内嵌封面成员的 ref（供概览惰性 resolveCover）
        // 冻结：同一 coverRef 会被 folder/album/artist 三处共享引用，防任一消费者 mutate 污染其它集合
        const coverRef: Readonly<MediaRef> | undefined = meta?.hasCoverArt
            ? Object.freeze({ platform: item.platform, id: item.id })
            : undefined;

        const folderGroup = byFolder.get(folder);
        if (folderGroup) {
            folderGroup.paths.push(path);
            if (coverRef && !folderGroup.coverRef) {
                folderGroup.coverRef = coverRef;
            }
        } else {
            byFolder.set(folder, { paths: [path], coverRef });
        }

        const album = byAlbum.get(aKey);
        if (album) {
            album.paths.push(path);
            if (coverRef && !album.coverRef) {
                album.coverRef = coverRef;
            }
        } else {
            byAlbum.set(aKey, {
                album: item.album,
                albumArtist,
                paths: [path],
                coverRef,
            });
        }

        const artist = byArtist.get(item.artist);
        if (artist) {
            artist.paths.push(path);
            artist.albums.add(aKey);
            if (coverRef && !artist.coverRef) {
                artist.coverRef = coverRef;
            }
        } else {
            byArtist.set(item.artist, {
                albums: new Set([aKey]),
                paths: [path],
                coverRef,
            });
        }
    }
    return {
        byFolder,
        byAlbum,
        byArtist,
        byRef,
        duplicated,
        collections: new Map(),
        sortedAll: new Map(),
        sortedMembers: new Map(),
    };
}

function getIndex(library: LocalLibrary): DerivedIndex {
    let index = indexCache.get(library);
    if (!index) {
        index = buildIndex(library);
        indexCache.set(library, index);
    }
    return index;
}

/** MediaRef → 代表 path（O(1) 反查，供移除/删除）；不在库返回 undefined */
export function pathByRef(
    library: LocalLibrary,
    ref: MediaRef,
): string | undefined {
    return getIndex(library).byRef.get(mediaKey(ref));
}

/**
 * 确有多份文件的身份 → 其代表 path；正常为空
 * 扫描逐文件写播放锚点时会被同身份的后来副本覆盖，调用方据此做一次纠正即可
 */
export function duplicatedRefs(
    library: LocalLibrary,
): ReadonlyMap<string, string> {
    return getIndex(library).duplicated;
}

/** 排序缓存 key：字段 + 方向（JSON 元组无碰撞） */
function sortKeyOf(sort: LocalSort): string {
    return JSON.stringify([sort.by, sort.desc]);
}

/** 某集合的成员 path（从反向索引 O(1) 取，不再全库扫描）；未命中返回 undefined（不缓存空结果） */
function membersOf(
    index: DerivedIndex,
    view: LocalCollectionView,
    key: string,
): readonly string[] | undefined {
    if (view === 'folders') {
        return index.byFolder.get(key)?.paths;
    }
    if (view === 'albums') {
        return index.byAlbum.get(key)?.paths;
    }
    return index.byArtist.get(key)?.paths;
}

/** 某集合的代表封面曲 ref（首个有内嵌封面成员；无则 undefined）——供详情头惰性 resolveCover */
export function collectionCoverRef(
    library: LocalLibrary,
    view: LocalCollectionView,
    key: string,
): Readonly<MediaRef> | undefined {
    const index = getIndex(library);
    if (view === 'folders') {
        return index.byFolder.get(key)?.coverRef;
    }
    if (view === 'albums') {
        return index.byAlbum.get(key)?.coverRef;
    }
    return index.byArtist.get(key)?.coverRef;
}

/** 全部曲目按全局排序（按 sortKey 缓存复用） */
export function sortedMusicList(
    library: LocalLibrary,
    sort: LocalSort,
): readonly MusicItem[] {
    const index = getIndex(library);
    const key = sortKeyOf(sort);
    let list = index.sortedAll.get(key);
    if (!list) {
        // 只排代表路径：同一首歌的多份文件不得拆成多行
        list = sortedItemsForPaths(library, [...index.byRef.values()], sort);
        index.sortedAll.set(key, list);
    }
    return list;
}

/** 某集合的曲目（按全局排序；按 view+key+sortKey 缓存复用；无效 key 返回共享空、不缓存） */
export function sortedCollectionMusic(
    library: LocalLibrary,
    view: LocalCollectionView,
    key: string,
    sort: LocalSort,
): readonly MusicItem[] {
    const index = getIndex(library);
    const members = membersOf(index, view, key);
    if (!members) {
        return EMPTY_MUSIC;
    }
    const cacheKey = JSON.stringify([view, key, sort.by, sort.desc]);
    let list = index.sortedMembers.get(cacheKey);
    if (!list) {
        list = sortedItemsForPaths(library, members, sort);
        index.sortedMembers.set(cacheKey, list);
    }
    return list;
}

/** 集合概览（按 name/album/artist 升序；不受 LocalSort 影响；按视图缓存复用） */
export function deriveCollections(
    library: LocalLibrary,
    view: LocalCollectionView,
): readonly LocalCollection[] {
    const index = getIndex(library);
    let collections = index.collections.get(view);
    if (!collections) {
        collections = buildCollections(index, view);
        index.collections.set(view, collections);
    }
    return collections;
}

function buildCollections(
    index: DerivedIndex,
    view: LocalCollectionView,
): readonly LocalCollection[] {
    if (view === 'folders') {
        const folders: Extract<LocalCollection, { kind: 'folder' }>[] = [];
        for (const [path, group] of index.byFolder) {
            folders.push({
                kind: 'folder',
                path,
                name: folderName(path),
                count: group.paths.length,
                coverRef: group.coverRef,
            });
        }
        folders.sort((a, b) => compareText(a.name, b.name));
        folders.forEach(folder => Object.freeze(folder));
        return Object.freeze(folders);
    }
    if (view === 'albums') {
        const albums: Extract<LocalCollection, { kind: 'album' }>[] = [];
        for (const [key, group] of index.byAlbum) {
            albums.push({
                kind: 'album',
                key,
                album: group.album,
                albumArtist: group.albumArtist,
                count: group.paths.length,
                coverRef: group.coverRef,
            });
        }
        albums.sort((a, b) => compareText(a.album, b.album));
        albums.forEach(album => Object.freeze(album));
        return Object.freeze(albums);
    }
    const artists: Extract<LocalCollection, { kind: 'artist' }>[] = [];
    for (const [artist, group] of index.byArtist) {
        artists.push({
            kind: 'artist',
            artist,
            albumCount: group.albums.size,
            count: group.paths.length,
            coverRef: group.coverRef,
        });
    }
    artists.sort((a, b) => compareText(a.artist, b.artist));
    artists.forEach(artist => Object.freeze(artist));
    return Object.freeze(artists);
}
