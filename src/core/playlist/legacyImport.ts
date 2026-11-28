/**
 * legacy 存储 → 干净模型的一次性导入（迁移阶梯 v0→v1 步骤）
 * legacy 格式知识集中于此文件、可整体删除；只读 legacy、只写 clean（从不写 legacy 格式）
 * 排序对照 legacy：addMusic $sortIndex=length-index，migrateV2 缺字段回填 $sortIndex=数组下标
 */
import { isFiniteNumber, isNonEmptyString, isRecord } from '@/utils/guards';
import { safeParse } from '@/utils/json';
import { coerceMusicItem, mediaKey } from '@/utils/media';
import { firstNonBlank } from '@/utils/text';

import {
    PLAYLIST_INDEX_STORE_ID,
    STARRED_STORE_ID,
    playlistStoreId,
    readIndex,
    readMusic,
    readStarred,
    writeIndex,
    writeMusic,
    writeSortMode,
    writeStarred,
} from './storage';
import { FAVORITE_PLAYLIST_ID, PlaylistMusicSortMode } from './types';

import type {
    MmkvReader,
    MmkvWriter,
    PlaylistMusicEntry,
    StoredPlaylistSummary,
} from './storage';
import type { StarredPlaylist } from './types';
import type { MusicItem } from '@/types';

/** legacy wire 字段（冻结，只出现在磁盘）：批次时间戳 */
const LEGACY_TIMESTAMP_FIELD = '$timestamp';
/** legacy wire 字段（冻结，只出现在磁盘）：批次内次序 */
const LEGACY_SORT_INDEX_FIELD = '$sortIndex';

/** legacy Local 摘要索引 store ID（数据在 data key） */
export const LEGACY_INDEX_STORE_ID = 'LocalSheet.music-sheets';
/** legacy Starred 快照 store ID（数据在 data key） */
export const LEGACY_STARRED_STORE_ID = 'LocalSheet.starred-sheets';
/** 单个 legacy Local 歌单 store 前缀 */
export const LEGACY_STORE_PREFIX = 'LocalSheet.';
/** 构造单个 legacy Local 歌单 store ID */
export function legacyPlaylistStoreId(playlistId: string): string {
    return `${LEGACY_STORE_PREFIX}${playlistId}`;
}
/** legacy store 内 JSON 数据键 */
export const LEGACY_DATA_KEY = 'data';
/** legacy 曲目排序键（值为 sort wire 字符串） */
export const LEGACY_SORT_KEY = 'meta.sort';
/** legacy schema 版本所在 store ID */
export const LEGACY_META_STORE_ID = 'App.meta';
/** legacy schema 版本键（当前值 2） */
export const LEGACY_VERSION_KEY = 'MusicSheetVersion';

/**
 * legacy sort wire（`meta.sort` 的值）→ 干净枚举
 * 未知 / `None` / 缺失回落 Manual
 */
export function sortWireToMode(
    wire: string | null | undefined,
): PlaylistMusicSortMode {
    switch (wire) {
        case 'title':
            return PlaylistMusicSortMode.Title;
        case 'artist':
            return PlaylistMusicSortMode.Artist;
        case 'album':
            return PlaylistMusicSortMode.Album;
        case 'time':
            return PlaylistMusicSortMode.AddedAtDesc;
        case 'time-rev':
            return PlaylistMusicSortMode.AddedAt;
        default:
            return PlaylistMusicSortMode.Manual;
    }
}

/** legacy 导入的注入依赖；P4 用 getOrCreateMMKV 装配 */
export interface LegacyImportDeps {
    /** 按 store id 取 MMKV 读写面 */
    openStore(id: string): MmkvReader & MmkvWriter;
    /** 单次导入时间戳；createAt/addedAt 缺失时统一回退 */
    importedAt: number;
}

/** 导入报告：由 playlistMigrations 的 onReport 交给上层留痕（进错误日志；不给恢复入口，legacy 数据原样保留） */
export interface LegacyImportReport {
    /** 因曲目 store 损坏而跳过、未导入的本地歌单 id（legacy 备份仍在、可后续恢复） */
    readonly skippedLocalPlaylistIds: readonly string[];
    /** legacy starred 损坏、未发布干净 starred（不覆盖原干净 starred） */
    readonly starredSkipped: boolean;
}

/** legacy store 的 data 读取分类：从未写过 / 合法数组 / 存在但损坏 */
type LegacyRead =
    | { kind: 'missing' }
    | { kind: 'array'; value: readonly unknown[] }
    | { kind: 'corrupt' };

/**
 * v0→v1：把 legacy LocalSheet.* 导入干净 Playlist.*（legacy 只读、只写 clean）
 * 损坏不静默当空：索引损坏 / legacy 存在却索引丢失 / 重复歌单 id → 中止；单歌单曲目损坏 → 跳过并计入 report；starred 损坏 → 不发空数组
 * MMKV 读写异常一律上抛（版本停 0、下次重放）；仅数据损坏才跳过
 * 自定义封面不在此迁移（文件 I/O 异步、属 M7）：一律先按自动导入，M7 惰性回读 legacy 迁移
 * favorite 的存在/归首不在此处理，留 P4 setup 聚合
 */
export function importLegacyIntoV1(deps: LegacyImportDeps): LegacyImportReport {
    const index = readLegacyData(deps.openStore(LEGACY_INDEX_STORE_ID));
    if (index.kind === 'corrupt') {
        throw new Error(
            'legacy 索引损坏：中止导入（保 legacy、下次重放），不写空覆盖',
        );
    }
    if (index.kind === 'missing' && hasLegacyVersionMarker(deps)) {
        throw new Error('legacy 存在但索引丢失：中止导入，不写空覆盖');
    }

    const summaries: StoredPlaylistSummary[] = [];
    const skippedLocalPlaylistIds: string[] = [];
    if (index.kind === 'array') {
        const seen = new Set<string>();
        for (const entry of index.value) {
            const id = coerceId(isRecord(entry) ? entry.id : undefined);
            if (id === undefined) {
                continue;
            }
            if (seen.has(id)) {
                throw new Error(`legacy 索引重复歌单 id ${id}：视为损坏、中止`);
            }
            seen.add(id);
            const summary = importOnePlaylist(entry, id, deps);
            if (summary) {
                summaries.push(summary);
            } else {
                skippedLocalPlaylistIds.push(id);
            }
        }
    }
    writeIndex(deps.openStore(PLAYLIST_INDEX_STORE_ID), summaries);

    const starred = readLegacyData(deps.openStore(LEGACY_STARRED_STORE_ID));
    const starredSkipped = starred.kind === 'corrupt';
    if (!starredSkipped) {
        const snapshots =
            starred.kind === 'array' ? decodeLegacyStarred(starred.value) : [];
        writeStarred(deps.openStore(STARRED_STORE_ID), snapshots);
    }

    verifyImport(deps, summaries, !starredSkipped);
    return { skippedLocalPlaylistIds, starredSkipped };
}

/**
 * 导入单个歌单：写其干净 store 并返回干净摘要；曲目 store 损坏或摘要无效返回 undefined（跳过）
 * 不吞 MMKV 读写异常——让其上抛中止整体导入（版本停 0、下次重放），避免半写 + 已提交
 */
function importOnePlaylist(
    rawEntry: unknown,
    id: string,
    deps: LegacyImportDeps,
): StoredPlaylistSummary | undefined {
    const legacyStore = deps.openStore(legacyPlaylistStoreId(id));
    const musicRead = readLegacyData(legacyStore);
    // 曲目 store 损坏（存在但非数组）→ 跳过整歌单；缺失（从未写 data）→ 空歌单导入
    // legacy 建歌单是「先写索引、后异步写空 data」两步，缺 data 多是刚建的空歌单（或已删残留），按空导入保住歌单身份
    if (musicRead.kind === 'corrupt') {
        return undefined;
    }
    const music =
        musicRead.kind === 'array'
            ? decodePlaylistMusic(musicRead.value, deps.importedAt)
            : [];
    const decoded = decodeLegacySummary(
        rawEntry,
        music.length,
        deps.importedAt,
    );
    if (!decoded) {
        return undefined;
    }
    const mode = sortWireToMode(legacyStore.getString(LEGACY_SORT_KEY));
    const cleanStore = deps.openStore(playlistStoreId(id));
    writeMusic(cleanStore, music);
    writeSortMode(cleanStore, mode);
    return decoded.summary;
}

/** 是否有 legacy 版本 marker：App.meta/MusicSheetVersion 有值即判 legacy 装过（区分全新安装 vs 索引丢失） */
function hasLegacyVersionMarker(deps: LegacyImportDeps): boolean {
    return (
        deps.openStore(LEGACY_META_STORE_ID).getString(LEGACY_VERSION_KEY) !==
        undefined
    );
}

/** 读 legacy store 的 data key 并分类（未写 / 合法数组 / 损坏） */
function readLegacyData(store: MmkvReader): LegacyRead {
    const raw = store.getString(LEGACY_DATA_KEY);
    if (raw === undefined) {
        return { kind: 'missing' };
    }
    const parsed = safeParse(raw);
    return Array.isArray(parsed)
        ? { kind: 'array', value: parsed }
        : { kind: 'corrupt' };
}

/**
 * 回读校验：干净索引、每个歌单曲目（数量与摘要 musicCount 一致）、以及写了的 starred 必须 valid
 * 任一不符抛错（runner 不 bump、下次重放）
 */
function verifyImport(
    deps: LegacyImportDeps,
    summaries: readonly StoredPlaylistSummary[],
    checkStarred: boolean,
): void {
    if (readIndex(deps.openStore(PLAYLIST_INDEX_STORE_ID)).status !== 'valid') {
        throw new Error('legacy 导入校验失败：Playlist.index 非 valid');
    }
    for (const summary of summaries) {
        const music = readMusic(deps.openStore(playlistStoreId(summary.id)));
        if (
            music.status !== 'valid' ||
            music.value.length !== summary.musicCount
        ) {
            throw new Error(
                `legacy 导入校验失败：歌单 ${summary.id} 曲目回读不符`,
            );
        }
    }
    if (
        checkStarred &&
        readStarred(deps.openStore(STARRED_STORE_ID)).status !== 'valid'
    ) {
        throw new Error('legacy 导入校验失败：Playlist.starred 非 valid');
    }
}

/**
 * 解码 legacy 歌单曲目数组（LocalSheet.<id>/data）为干净 PlaylistMusicEntry[]
 * 丢弃无 platform+id 的坏项、按 platform+id 去重保留第一条，其它插件字段原样保留
 * $timestamp → addedAt、$sortIndex → batchRank 并从 item 剥离；缺字段兜底 addedAt=fallbackAddedAt、batchRank=原数组下标
 * 绝不 mutate 输入 DTO；raw 非数组时返回空
 * @param fallbackAddedAt 缺 wire 字段时统一使用的迁移时间戳
 */
export function decodePlaylistMusic(
    raw: unknown,
    fallbackAddedAt: number,
): PlaylistMusicEntry[] {
    if (!Array.isArray(raw)) {
        return [];
    }
    const seen = new Set<string>();
    const entries: PlaylistMusicEntry[] = [];
    raw.forEach((value, index) => {
        const coerced = coerceMusicItem(value);
        if (!coerced) {
            return;
        }
        const key = mediaKey(coerced);
        if (seen.has(key)) {
            return;
        }
        seen.add(key);
        entries.push(toEntry(coerced, index, fallbackAddedAt));
    });
    return entries;
}

/** 提取排序元数据并剥离 wire 字段，产出干净 entry */
function toEntry(
    coerced: MusicItem,
    index: number,
    fallbackAddedAt: number,
): PlaylistMusicEntry {
    const source = coerced as Record<string, unknown>;
    const rawTimestamp = source[LEGACY_TIMESTAMP_FIELD];
    const rawSortIndex = source[LEGACY_SORT_INDEX_FIELD];
    const item = stripWireFields(source);
    // 两者均为有效数值时采用其顺序，否则回填；真实 legacy 数据恒为正整数时间戳+非负整数下标，等价于其缺字段判断
    if (
        typeof rawTimestamp === 'number' &&
        Number.isFinite(rawTimestamp) &&
        rawTimestamp > 0 &&
        typeof rawSortIndex === 'number' &&
        Number.isFinite(rawSortIndex)
    ) {
        return { item, addedAt: rawTimestamp, batchRank: rawSortIndex };
    }
    return { item, addedAt: fallbackAddedAt, batchRank: index };
}

/**
 * 剥离 item 上的 wire 字段，绝不 mutate 输入
 * 无这两个字段时原样返回；否则用 Object.fromEntries 重建为只含其它字段的浅拷贝
 * fromEntries 创建自有属性、不触发 setter，避免 __proto__ 等键污染原型或丢失
 */
function stripWireFields(source: Record<string, unknown>): MusicItem {
    if (
        !(LEGACY_TIMESTAMP_FIELD in source) &&
        !(LEGACY_SORT_INDEX_FIELD in source)
    ) {
        return source as unknown as MusicItem;
    }
    const clean = Object.fromEntries(
        Object.entries(source).filter(
            ([key]) =>
                key !== LEGACY_TIMESTAMP_FIELD &&
                key !== LEGACY_SORT_INDEX_FIELD,
        ),
    );
    return clean as unknown as MusicItem;
}

// —— legacy 摘要 / starred 解码 ——

/** 解码 legacy 摘要的结果：干净摘要（封面默认自动）+ 待迁移的自定义封面源 */
export interface DecodedLegacySummary {
    readonly summary: StoredPlaylistSummary;
    /**
     * legacy 自定义封面源（file:// 值）；仅候选、非最终
     * M5c/M7 据此定位持久副本（页面编辑器把 cache uri 存进 coverImg，但持久副本恒在 ${dataPath}sheet<id>.<扩展名>）
     * 复制进托管目录并回读校验成功后才升级 summary 的 hasCustomArtwork/artwork；失败留自动
     */
    readonly customArtworkSource?: string;
}

/**
 * 解码 legacy 歌单摘要（LocalSheet.music-sheets/data 单条）为干净 StoredPlaylistSummary
 * 只要求 id（本地歌单身份，platform 恒本地、隐含不落）；无有效 id 返回 undefined 丢弃
 * 封面默认自动（hasCustomArtwork=false、不落 artwork、运行时取自动封面）；file:// 封面另出 customArtworkSource 交 M5c 迁移文件后再定夺，避免把可能失效的 cache uri 当最终 artwork
 * createdAt 优先 legacy createAt，缺失（favorite / 早期歌单）回落 importedAt
 * @param musicCount 曲目解码后的数量（legacy worksNum 忽略）
 * @param importedAt 缺 createAt 时的回退时间戳
 */
export function decodeLegacySummary(
    raw: unknown,
    musicCount: number,
    importedAt: number,
): DecodedLegacySummary | undefined {
    if (!isRecord(raw)) {
        return undefined;
    }
    const id = coerceId(raw.id);
    if (id === undefined) {
        return undefined;
    }
    const cover = firstNonBlank(raw.artwork, raw.coverImg);
    const base = {
        title: isNonEmptyString(raw.title) ? raw.title : '',
        description: isNonEmptyString(raw.description)
            ? raw.description
            : undefined,
        artwork: undefined,
        hasCustomArtwork: false,
        musicCount,
        createdAt: isFiniteNumber(raw.createAt) ? raw.createAt : importedAt,
    };
    const summary: StoredPlaylistSummary =
        id === FAVORITE_PLAYLIST_ID
            ? { ...base, id: FAVORITE_PLAYLIST_ID, kind: 'favorite' }
            : { ...base, id, kind: 'user' };
    return isFileUri(cover)
        ? { summary, customArtworkSource: cover }
        : { summary };
}

/**
 * 解码 legacy Starred 快照数组（LocalSheet.starred-sheets/data）为干净 StarredPlaylist[]
 * 需 platform+id（插件榜单/歌单的 MediaRef 身份）；数字 id 转字符串
 * 按 MediaRef 去重保首条；深拷贝隔离 legacy 内存、保留插件字段与可选 musicList；不可序列化的项丢弃
 */
export function decodeLegacyStarred(raw: unknown): StarredPlaylist[] {
    if (!Array.isArray(raw)) {
        return [];
    }
    const seen = new Set<string>();
    const result: StarredPlaylist[] = [];
    for (const entry of raw) {
        const decoded = decodeStarredEntry(entry);
        if (!decoded) {
            continue;
        }
        const key = mediaKey(decoded);
        if (seen.has(key)) {
            continue;
        }
        seen.add(key);
        result.push(decoded);
    }
    return result;
}

/** 解码单条 starred：校验 MediaRef 身份 + 深拷贝 + 规范 id；无效返回 undefined */
function decodeStarredEntry(entry: unknown): StarredPlaylist | undefined {
    if (!isRecord(entry)) {
        return undefined;
    }
    const platform = isNonEmptyString(entry.platform)
        ? entry.platform
        : undefined;
    const id = coerceId(entry.id);
    if (platform === undefined || id === undefined) {
        return undefined;
    }
    let cloned: Record<string, unknown>;
    try {
        cloned = JSON.parse(JSON.stringify(entry)) as Record<string, unknown>;
    } catch {
        return undefined;
    }
    cloned.platform = platform;
    cloned.id = id;
    // legacy 收藏用旧拼写 createAt，补齐 canonical createdAt（保留旧键，与插件入口归一一致）
    if (!isFiniteNumber(cloned.createdAt) && isFiniteNumber(cloned.createAt)) {
        cloned.createdAt = cloned.createAt;
    }
    return cloned as unknown as StarredPlaylist;
}

/** legacy id 规范：非空字符串直接用；有限数字转字符串；否则 undefined */
function coerceId(value: unknown): string | undefined {
    if (isNonEmptyString(value)) {
        return value;
    }
    if (isFiniteNumber(value)) {
        return String(value);
    }
    return undefined;
}

/** legacy 自定义封面 = 本地 file:// 托管文件；远程 URL / 空 = 自动封面 */
function isFileUri(value: string | undefined): boolean {
    return value !== undefined && value.startsWith('file://');
}
