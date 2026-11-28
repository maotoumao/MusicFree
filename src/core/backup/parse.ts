import { os } from '@/infra/device';
import { isFiniteNumber, isNonEmptyString, isRecord } from '@/utils/guards';
import { looksLikeHttpUrl } from '@/utils/url';

import type {
    BackupFormatVariant,
    BackupOrigin,
    BackupSections,
    BackupSettings,
    ParseBackupResult,
} from './types';
import type { MediaMetaTransferItem } from '@/core/mediaMeta';
import type {
    LocalPlaylistTransferItem,
    PlaylistMusicSortMode,
    StarredPlaylist,
} from '@/core/playlist';
import type { PluginsTransfer } from '@/core/plugin';
import type { DeepReadonly } from '@/types';

/** 内建「我喜欢」歌单 id（复制 core/playlist FAVORITE_PLAYLIST_ID 的冻结 wire 值） */
const FAVORITE_PLAYLIST_ID = 'favorite';

/** 是否为有 platform + id 的合法媒体引用 */
function hasMediaIdentity(item: unknown): boolean {
    return (
        isRecord(item) &&
        isNonEmptyString(item.platform) &&
        isNonEmptyString(item.id)
    );
}

/**
 * 规范化 MusicItem 的 App 已知字段，避免不可信备份里错误类型触发下游崩溃（.trim() / 原生桥类型不符）
 * 数字 id → 字符串；title/artist/album/artwork 非字符串则删；duration 非有限数则删
 * 只碰 MusicItem 已知字段，插件扩展字段（含插件自带的 coverImg/description）原样保留
 * 就地改 JSON.parse 得到的对象（独占、无需克隆）
 */
function normalizeMusicItem(item: unknown): unknown {
    if (!isRecord(item)) {
        return item;
    }
    const rec = item;
    if (isFiniteNumber(rec.id)) {
        rec.id = String(rec.id);
    }
    for (const field of ['title', 'artist', 'album', 'artwork']) {
        if (typeof rec[field] !== 'string') {
            delete rec[field];
        }
    }
    if (typeof rec.duration !== 'number' || !Number.isFinite(rec.duration)) {
        delete rec.duration;
    }
    return rec;
}

/**
 * 规范化收藏歌单头（PlaylistItemBase）的 App 已知字段；插件扩展字段（含插件自带的 album）原样保留
 * 数字 id → 字符串；废弃 coverImg → artwork（仅 artwork 缺失时补）随后移除别名；title/artist/artwork/description 非字符串则删
 * 旧拼写 createAt → canonical createdAt（保留旧键，与 core/plugin 入口归一一致，实时数据与恢复数据同形）
 * 内嵌 musicList（若为数组）逐项按 MusicItem 归一
 */
function normalizeStarredHead(item: unknown): unknown {
    if (!isRecord(item)) {
        return item;
    }
    const rec = item;
    if (isFiniteNumber(rec.id)) {
        rec.id = String(rec.id);
    }
    // canonical createdAt：缺失 / 非法时回落旧拼写 createAt，仍非法则移除（保证类型契约）
    if (!isFiniteNumber(rec.createdAt)) {
        if (isFiniteNumber(rec.createAt)) {
            rec.createdAt = rec.createAt;
        } else {
            delete rec.createdAt;
        }
    }
    // 废弃 coverImg 仅在 artwork 缺失时补入，随后移除该别名（canonical 只留 artwork）
    if (typeof rec.artwork !== 'string' && typeof rec.coverImg === 'string') {
        rec.artwork = rec.coverImg;
    }
    delete rec.coverImg;
    for (const field of ['title', 'artist', 'artwork', 'description']) {
        if (typeof rec[field] !== 'string') {
            delete rec[field];
        }
    }
    if (Array.isArray(rec.musicList)) {
        rec.musicList = rec.musicList.map(normalizeMusicItem);
    }
    return rec;
}

/**
 * canonical 歌单排序 wire 值全集；`satisfies` 锁定与 `PlaylistMusicSortMode` 同步——枚举增删值会在此编译失败
 * 用模板字面量取枚举的字符串值，避免 runtime import core/playlist 的 enum
 */
const CANONICAL_SORT_MODES = {
    manual: true,
    title: true,
    titleDesc: true,
    artist: true,
    artistDesc: true,
    album: true,
    albumDesc: true,
    addedAt: true,
    addedAtDesc: true,
} satisfies Record<`${PlaylistMusicSortMode}`, true>;

/**
 * 合法歌单排序 wire 值（本地白名单）
 * `time` / `time-rev` 是 legacy 备份专有的旧值，映射到领域词 `addedAtDesc` / `addedAt`；非法 → undefined（端口默认 manual）
 */
function normalizeSortMode(
    raw: unknown,
): `${PlaylistMusicSortMode}` | undefined {
    if (
        typeof raw === 'string' &&
        Object.prototype.hasOwnProperty.call(CANONICAL_SORT_MODES, raw)
    ) {
        return raw as `${PlaylistMusicSortMode}`;
    }
    switch (raw) {
        case 'time':
            return 'addedAtDesc';
        case 'time-rev':
            return 'addedAt';
        default:
            return undefined;
    }
}

/**
 * 归一 musicSheets：构造 canonical 歌单——校验 / 回落自身元数据（title / description / createdAt / sortMode），
 * 避免非法值写入使歌单存储在下次加载时判损坏降级；曲目逐项按 MusicItem 归一（去重 / 发新 id 仍交端口）
 * 结果须恰一个 favorite：`v2` 下 favorite 条目数 !=1 → 丢段；`legacy`（旧手机 / 桌面 v1）下 favorite 取首现；
 * 0 个 favorite（如旧格式空 / 只有普通歌单）→ 丢段（缺段 = 恢复不动目标端 favorite）
 */
function normalizeMusicSheets(
    raw: unknown,
    variant: 'v2' | 'legacy',
): readonly DeepReadonly<LocalPlaylistTransferItem>[] | undefined {
    if (!Array.isArray(raw)) {
        return undefined;
    }
    const arr: unknown[] = raw;
    // v2 必须恰一个 favorite 条目（按 id 计，含结构损坏的那条也算，避免「一真一坏」蒙混）
    if (
        variant === 'v2' &&
        arr.filter(item => isRecord(item) && item.id === FAVORITE_PLAYLIST_ID)
            .length !== 1
    ) {
        return undefined;
    }
    const sheets: {
        id: string;
        title: string;
        description?: string;
        createdAt?: number;
        sortMode?: string;
        musicList: unknown[];
    }[] = [];
    let favorites = 0;
    for (const item of arr) {
        // 歌单项须有非空 id + musicList 数组，否则跳过
        if (
            !isRecord(item) ||
            !isNonEmptyString(item.id) ||
            !Array.isArray(item.musicList)
        ) {
            continue;
        }
        if (item.id === FAVORITE_PLAYLIST_ID) {
            if (favorites >= 1) {
                continue; // 取首现（v2 的多 favorite 已在上面按条目数拦截）
            }
            favorites += 1;
        }
        const sortMode = normalizeSortMode(item.sortMode);
        let createdAt = isFiniteNumber(item.createdAt)
            ? item.createdAt
            : undefined;
        // legacy 备份的歌单用旧拼写 createAt
        if (createdAt === undefined && isFiniteNumber(item.createAt)) {
            createdAt = item.createAt;
        }
        sheets.push({
            id: item.id,
            title: typeof item.title === 'string' ? item.title : '',
            ...(typeof item.description === 'string'
                ? { description: item.description }
                : {}),
            ...(createdAt !== undefined ? { createdAt } : {}),
            ...(sortMode !== undefined ? { sortMode } : {}),
            musicList: item.musicList.map(normalizeMusicItem),
        });
    }
    if (favorites !== 1) {
        return undefined;
    }
    return sheets as unknown as readonly DeepReadonly<LocalPlaylistTransferItem>[];
}

/**
 * 归一 starredPlaylists：数组内逐项规范收藏歌单头（含内嵌 musicList）的 App 字段
 * 身份校验（platform+id 合法、排除本地）与去重仍交端口 coerceStarred
 */
function normalizeStarredPlaylists(
    raw: unknown,
): readonly StarredPlaylist[] | undefined {
    if (!Array.isArray(raw)) {
        return undefined;
    }
    return raw.map(
        normalizeStarredHead,
    ) as unknown as readonly StarredPlaylist[];
}

/**
 * 归一 plugins：过滤形状不合法条目——srcUrl / 订阅 url 仅收 http(s)（不可信备份可能藏 file: 等 scheme，
 * 恢复端会直接联网 / 落库，安全边界须在此挡）；补 enabled 默认 true（legacy 无此字段，避免误禁用）
 */
function normalizePlugins(raw: unknown): PluginsTransfer | undefined {
    if (!isRecord(raw)) {
        return undefined;
    }
    const rec = raw;
    const installed = (Array.isArray(rec.installed) ? rec.installed : [])
        .filter(
            (r): r is Record<string, unknown> =>
                isRecord(r) &&
                isNonEmptyString(r.srcUrl) &&
                looksLikeHttpUrl(r.srcUrl),
        )
        .map(r => ({
            srcUrl: r.srcUrl as string,
            ...(typeof r.version === 'string' ? { version: r.version } : {}),
            enabled: r.enabled !== false,
        }));
    const subscriptions = (
        Array.isArray(rec.subscriptions) ? rec.subscriptions : []
    )
        .filter(
            (r): r is Record<string, unknown> =>
                isRecord(r) &&
                isNonEmptyString(r.url) &&
                looksLikeHttpUrl(r.url),
        )
        .map(r => ({
            name: typeof r.name === 'string' ? r.name : (r.url as string),
            url: r.url as string,
        }));
    const alternatives = (
        Array.isArray(rec.alternatives) ? rec.alternatives : []
    )
        .filter(
            (r): r is Record<string, unknown> =>
                isRecord(r) &&
                isNonEmptyString(r.platform) &&
                isNonEmptyString(r.alternativePlatform),
        )
        .map(r => ({
            platform: r.platform as string,
            alternativePlatform: r.alternativePlatform as string,
        }));
    return { installed, subscriptions, alternatives };
}

/**
 * 归一 mediaMeta：条目须有 platform + id；关联歌词的 musicItem 规范 App 字段后须仍是合法引用（有 platform+id），
 * 否则整段 associatedLyric 丢弃（保留同条 lyricOffset）——恢复端 restoreMediaMeta 不校验 musicItem 身份
 */
function normalizeMediaMeta(
    raw: unknown,
): readonly MediaMetaTransferItem[] | undefined {
    if (!Array.isArray(raw)) {
        return undefined;
    }
    const items = raw.filter(
        (item): item is Record<string, unknown> =>
            isRecord(item) &&
            typeof item.platform === 'string' &&
            typeof item.id === 'string',
    );
    for (const rec of items) {
        const assoc = rec.associatedLyric;
        if (!isRecord(assoc)) {
            continue;
        }
        const musicItem = normalizeMusicItem(assoc.musicItem);
        if (hasMediaIdentity(musicItem)) {
            assoc.musicItem = musicItem;
        } else {
            delete rec.associatedLyric;
        }
    }
    return items as unknown as readonly MediaMetaTransferItem[];
}

/** 归一 origin：platform 须为已知平台，否则作废；缺 appVersion / installationId 回落空串 */
function normalizeOrigin(raw: unknown): BackupOrigin | undefined {
    if (!isRecord(raw)) {
        return undefined;
    }
    const { platform } = raw;
    if (
        platform !== 'android' &&
        platform !== 'ios' &&
        platform !== 'desktop'
    ) {
        return undefined;
    }
    return {
        platform,
        appVersion: typeof raw.appVersion === 'string' ? raw.appVersion : '',
        installationId:
            typeof raw.installationId === 'string' ? raw.installationId : '',
    };
}

/** 归一 settings：产出平台与本机不符 → 整段丢弃（跨端设置不可移植）；values 须为对象 */
function normalizeSettings(
    raw: unknown,
    originPlatform: BackupOrigin['platform'] | undefined,
): BackupSettings | undefined {
    if (originPlatform !== os) {
        return undefined;
    }
    if (!isRecord(raw) || !isRecord(raw.values)) {
        return undefined;
    }
    return { values: raw.values };
}

/** v2 / future：读 sections，逐段结构校验（malformed 丢段、不整体拒绝），settings 平台门控 */
function parseV2(
    obj: Record<string, unknown>,
    formatVariant: BackupFormatVariant,
): ParseBackupResult {
    const rawSections = obj.sections;
    if (!isRecord(rawSections)) {
        return { ok: false, reason: 'corrupt' };
    }
    const origin = normalizeOrigin(obj.origin);
    const sections: BackupSections = {};

    const musicSheets = normalizeMusicSheets(rawSections.musicSheets, 'v2');
    if (musicSheets) {
        sections.musicSheets = musicSheets;
    }
    const starred = normalizeStarredPlaylists(rawSections.starredPlaylists);
    if (starred) {
        sections.starredPlaylists = starred;
    }
    const plugins = normalizePlugins(rawSections.plugins);
    if (plugins) {
        sections.plugins = plugins;
    }
    const mediaMeta = normalizeMediaMeta(rawSections.mediaMeta);
    if (mediaMeta) {
        sections.mediaMeta = mediaMeta;
    }
    const settings = normalizeSettings(rawSections.settings, origin?.platform);
    if (settings) {
        sections.settings = settings;
    }

    return {
        ok: true,
        formatVariant,
        origin,
        createdAt: isFiniteNumber(obj.createdAt) ? obj.createdAt : undefined,
        sections,
    };
}

/**
 * legacy 手机备份（无 version）：顶层 musicSheets + 顶层 plugins[] → installed
 * 仅为兼容旧版本导出的文件而存在；宽容归一、无 origin / createdAt
 */
function parseLegacyMobile(obj: Record<string, unknown>): ParseBackupResult {
    const sections: BackupSections = {};
    const musicSheets = normalizeMusicSheets(obj.musicSheets, 'legacy');
    if (musicSheets) {
        sections.musicSheets = musicSheets;
    }
    // 顶层 plugins 为 [{ srcUrl, version }]，映射到 installed
    if (Array.isArray(obj.plugins)) {
        const plugins = normalizePlugins({
            installed: obj.plugins,
            subscriptions: [],
            alternatives: [],
        });
        if (plugins) {
            sections.plugins = plugins;
        }
    }
    return { ok: true, formatVariant: 'legacyMobile', sections };
}

/**
 * legacy 桌面备份（version===1）：只有顶层 musicSheets
 * 仅为兼容 v2 之前的桌面端导出文件而存在；宽容归一、无 origin
 */
function parseDesktopV1(obj: Record<string, unknown>): ParseBackupResult {
    const sections: BackupSections = {};
    const musicSheets = normalizeMusicSheets(obj.musicSheets, 'legacy');
    if (musicSheets) {
        sections.musicSheets = musicSheets;
    }
    return {
        ok: true,
        formatVariant: 'desktopV1',
        createdAt: isFiniteNumber(obj.createdAt) ? obj.createdAt : undefined,
        sections,
    };
}

/** 按 format / version 有序互斥判别 → 分派解析（命中即停） */
export function parseBackupText(text: string): ParseBackupResult {
    let raw: unknown;
    try {
        // 容忍前导 BOM：我们产出时不写，但别的端可能写，JSON.parse 遇 U+FEFF 会直接失败
        raw = JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
    } catch {
        return { ok: false, reason: 'corrupt' };
    }
    if (!isRecord(raw)) {
        return { ok: false, reason: 'corrupt' };
    }
    const obj = raw;

    const { version, format } = obj;
    const hasTopSheets = Array.isArray(obj.musicSheets);

    // 1 无 version 且顶层 musicSheets 数组 → legacy 手机
    if (version === undefined && hasTopSheets) {
        return parseLegacyMobile(obj);
    }
    // 2 version===1 且顶层 musicSheets 数组 → 桌面 v1
    if (version === 1 && hasTopSheets) {
        return parseDesktopV1(obj);
    }
    // 3 format 命中 + version===2 → 本规格 v2
    if (format === 'musicfree-backup' && version === 2) {
        return parseV2(obj, 'v2');
    }
    // 4 format 命中 + 整数 version>2 → 更新版本，尽力读已知段
    if (
        format === 'musicfree-backup' &&
        typeof version === 'number' &&
        Number.isInteger(version) &&
        version > 2
    ) {
        return parseV2(obj, 'future');
    }
    // 5 其余 → 非 MusicFree 备份
    return { ok: false, reason: 'notBackup' };
}
