/**
 * 干净运行时存储格式（Playlist.*）的读写 adapter + 形状校验
 * 只认干净格式、不含任何 legacy 知识；MMKV 实例由调用方经 getOrCreateMMKV 提供
 * 读先 getString 再解析以区分 missing 与损坏；写失败（序列化/set）向上抛，不吞用户资产
 */
import { isFiniteNumber, isNonEmptyString, isRecord } from '@/utils/guards';
import { safeParse } from '@/utils/json';

import { FAVORITE_PLAYLIST_ID, PlaylistMusicSortMode } from './types';

import type { StarredPlaylist } from './types';
import type { MusicItem } from '@/types';

/** Local playlist 索引 store（摘要 + $version 全局版本） */
export const PLAYLIST_INDEX_STORE_ID = 'Playlist.index';
/** Starred playlist store */
export const STARRED_STORE_ID = 'Playlist.starred';
/** 单个歌单 store 前缀；`local` 子命名空间确保动态 ID 不会撞上固定的 index/starred store */
const PLAYLIST_STORE_PREFIX = 'Playlist.local.';
/** 单个歌单 store ID 只由此构造 */
export function playlistStoreId(id: string): string {
    return `${PLAYLIST_STORE_PREFIX}${id}`;
}
/** store 内 JSON 数据键 */
export const PLAYLIST_DATA_KEY = 'data';
/** 排序模式键（值为干净枚举字符串，非 JSON） */
export const PLAYLIST_SORT_KEY = 'meta.sort';

/**
 * MusicItem 在某个 Local playlist 中的成员元数据（干净存储与内存形态）
 * addedAt / batchRank 只在本 wrapper、不落 item；内部工作态，不从 core/playlist barrel 导出
 */
export interface PlaylistMusicEntry {
    readonly item: MusicItem;
    readonly addedAt: number;
    readonly batchRank: number;
}

/** 单个歌单摘要的存储共性字段 */
interface StoredPlaylistSummaryBase {
    readonly title: string;
    readonly description?: string;
    readonly artwork?: string;
    readonly hasCustomArtwork: boolean;
    readonly musicCount: number;
    readonly createdAt: number;
}
/** 固定「我喜欢」歌单摘要 */
export interface StoredFavoriteSummary extends StoredPlaylistSummaryBase {
    readonly id: typeof FAVORITE_PLAYLIST_ID;
    readonly kind: 'favorite';
}
/** 普通用户歌单摘要；id 保证不等于 favorite */
export interface StoredUserSummary extends StoredPlaylistSummaryBase {
    readonly id: string;
    readonly kind: 'user';
}
/** 单个歌单摘要的存储形态；映射为公开 LocalPlaylist */
export type StoredPlaylistSummary = StoredFavoriteSummary | StoredUserSummary;

/** store 读取分类：区分从未写过、有效、存在但损坏 */
export type PlaylistStorageRead<T> =
    | { status: 'missing' }
    | { status: 'valid'; value: T; raw: string }
    | { status: 'corrupt'; raw: string };

/** 读侧只依赖 getString；真实 MMKV 结构上满足 */
export interface MmkvReader {
    getString(key: string): string | undefined;
}

/** 写侧只依赖 set/remove；真实 MMKV 结构上满足 */
export interface MmkvWriter {
    set(key: string, value: string): void;
    remove(key: string): void;
}

/** 读 + 分类；先 getString 才能区分 missing 与解析失败，不用会吞错的 getObject */
function readClassified<T>(
    mmkv: MmkvReader,
    key: string,
    validate: (value: unknown) => value is T,
): PlaylistStorageRead<T> {
    const raw = mmkv.getString(key);
    if (raw === undefined) {
        return { status: 'missing' };
    }
    const parsed = safeParse<unknown>(raw);
    if (parsed === undefined || !validate(parsed)) {
        return { status: 'corrupt', raw };
    }
    return { status: 'valid', value: parsed, raw };
}

/** 读歌单索引摘要 */
export function readIndex(
    mmkv: MmkvReader,
): PlaylistStorageRead<StoredPlaylistSummary[]> {
    return readClassified(mmkv, PLAYLIST_DATA_KEY, isSummaryArray);
}

/** 读单个歌单的曲目 */
export function readMusic(
    mmkv: MmkvReader,
): PlaylistStorageRead<PlaylistMusicEntry[]> {
    return readClassified(mmkv, PLAYLIST_DATA_KEY, isMusicEntryArray);
}

/** 读 Starred 快照 */
export function readStarred(
    mmkv: MmkvReader,
): PlaylistStorageRead<StarredPlaylist[]> {
    return readClassified(mmkv, PLAYLIST_DATA_KEY, isStarredArray);
}

/** 读排序模式；缺失或非法值返回 undefined（由上层回落默认） */
export function readSortMode(
    mmkv: MmkvReader,
): PlaylistMusicSortMode | undefined {
    const raw = mmkv.getString(PLAYLIST_SORT_KEY);
    return isSortMode(raw) ? raw : undefined;
}

// —— 写侧（序列化失败或 set 抛错都向上冒泡，不吞用户资产写失败）——

/** 写歌单索引摘要 */
export function writeIndex(
    mmkv: MmkvWriter,
    summaries: readonly StoredPlaylistSummary[],
): void {
    mmkv.set(PLAYLIST_DATA_KEY, JSON.stringify(summaries));
}

/** 写单个歌单的曲目 */
export function writeMusic(
    mmkv: MmkvWriter,
    entries: readonly PlaylistMusicEntry[],
): void {
    mmkv.set(PLAYLIST_DATA_KEY, JSON.stringify(entries));
}

/** 写 Starred 快照 */
export function writeStarred(
    mmkv: MmkvWriter,
    snapshots: readonly StarredPlaylist[],
): void {
    mmkv.set(PLAYLIST_DATA_KEY, JSON.stringify(snapshots));
}

/** 写排序模式（干净枚举值） */
export function writeSortMode(
    mmkv: MmkvWriter,
    mode: PlaylistMusicSortMode,
): void {
    mmkv.set(PLAYLIST_SORT_KEY, mode);
}

// —— 形状校验（不合期望形状即 corrupt）——

function isNonNegativeInteger(value: unknown): value is number {
    return (
        typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    );
}
function isOptionalString(value: unknown): boolean {
    return value === undefined || typeof value === 'string';
}

function isSummary(value: unknown): value is StoredPlaylistSummary {
    if (!isRecord(value)) {
        return false;
    }
    if (
        typeof value.title !== 'string' ||
        typeof value.hasCustomArtwork !== 'boolean' ||
        !isNonNegativeInteger(value.musicCount) ||
        !isFiniteNumber(value.createdAt) ||
        !isOptionalString(value.description) ||
        !isOptionalString(value.artwork)
    ) {
        return false;
    }
    // favorite ⇔ id===FAVORITE_PLAYLIST_ID：保留判别联合、防绕过 favorite 保护
    if (value.kind === 'favorite') {
        return value.id === FAVORITE_PLAYLIST_ID;
    }
    if (value.kind === 'user') {
        return isNonEmptyString(value.id) && value.id !== FAVORITE_PLAYLIST_ID;
    }
    return false;
}
function isSummaryArray(value: unknown): value is StoredPlaylistSummary[] {
    return Array.isArray(value) && value.every(isSummary);
}

function isMusicEntry(value: unknown): value is PlaylistMusicEntry {
    if (!isRecord(value)) {
        return false;
    }
    if (!isFiniteNumber(value.addedAt) || !isFiniteNumber(value.batchRank)) {
        return false;
    }
    const item = value.item;
    return (
        isRecord(item) &&
        isNonEmptyString(item.platform) &&
        isNonEmptyString(item.id)
    );
}
function isMusicEntryArray(value: unknown): value is PlaylistMusicEntry[] {
    return Array.isArray(value) && value.every(isMusicEntry);
}

function isStarred(value: unknown): value is StarredPlaylist {
    return (
        isRecord(value) &&
        isNonEmptyString(value.platform) &&
        isNonEmptyString(value.id)
    );
}
function isStarredArray(value: unknown): value is StarredPlaylist[] {
    return Array.isArray(value) && value.every(isStarred);
}

function isSortMode(value: unknown): value is PlaylistMusicSortMode {
    return (
        typeof value === 'string' &&
        (Object.values(PlaylistMusicSortMode) as string[]).includes(value)
    );
}
