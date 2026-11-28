/**
 * 插件方法输入/输出规范化表（数据驱动，methods.ts 的归口按此表整形）
 * 只做「规范化」：platform 盖章 / 默认值 / sheet 出站归一 / 结果整形；缓存·重试·mediaMeta·本地歌词一律包在归口外（core/player·lyric·mediaMeta）
 */
import { isFiniteNumber } from '@/utils/guards';

import type { PluginMethods } from './types';
import type {
    AlbumInfoResult,
    ArtistMediaType,
    Comment,
    MediaType,
    MusicItem,
    PaginationResponse,
    PlaylistGroup,
    PlaylistInfoResult,
    PlaylistItemBase,
    PluginDefinition,
    RecommendPlaylistTagsResult,
    RecommendTag,
    RecommendTagGroup,
    SearchResult,
    SheetInfoResult,
    TopListInfoResult,
} from '@/types';

/** 插件 DTO 内部字段标记（'$'）：app 侧内部态历史挂此 key，wire 冻结值；插件输出里若混入一律剥掉，保快照干净 */
const INTERNAL_KEY = '$';

/** 单个媒体项归一：返新对象、剥内部字段、强制盖 owning 插件的 platform（身份必须与返回它的插件一致） */
export function normalizeMediaItem<T extends object>(
    item: T,
    platform: string,
): T & { platform: string } {
    const rest: Record<string, unknown> = {
        ...(item as Record<string, unknown>),
    };
    delete rest[INTERNAL_KEY];
    // 插件可能返 number id；DTO 与原生桥统一要 string，仅转有限数字（NaN/Infinity 不转，免造出会撞键的假 id）
    if (isFiniteNumber(rest.id)) {
        rest.id = String(rest.id);
    }
    // 歌单旧拼写 createAt → canonical createdAt；保留旧键（要落盘 / 进备份继续喂桌面端）
    if (!isFiniteNumber(rest.createdAt)) {
        if (isFiniteNumber(rest.createAt)) {
            rest.createdAt = rest.createAt;
        } else {
            delete rest.createdAt;
        }
    }
    return { ...rest, platform } as T & { platform: string };
}

/** 批量归一；入参为 undefined 时原样返 undefined（保留可选字段语义，必填处调用方 `?? []`） */
export function normalizeMediaItems<T extends object>(
    items: T[] | undefined,
    platform: string,
): (T & { platform: string })[] | undefined {
    return items?.map(i => normalizeMediaItem(i, platform));
}

/** isEnd 归一：仅显式 false 视为「还有下一页」，缺省 / 脏值一律 true（到底），杜绝未声明时无限翻页 */
function normalizeIsEnd(raw: unknown): boolean {
    return raw !== false;
}

/** 归一单个推荐 tag：id 必须非空（数字转字符串），保留 title + 扩展字段；无效 → null */
function normalizeRecommendTag(raw: unknown): RecommendTag | null {
    if (typeof raw !== 'object' || raw === null) {
        return null;
    }
    const { id } = raw as { id?: unknown };
    if (typeof id === 'string' && id.length > 0) {
        return raw as RecommendTag;
    }
    if (typeof id === 'number' && Number.isFinite(id)) {
        return { ...(raw as RecommendTag), id: String(id) };
    }
    return null;
}

/** 归一 RecommendTag[]：仅留合法 tag；非数组（未声明 / 脏数据）→ 空数组 */
function normalizeRecommendTags(raw: unknown): RecommendTag[] {
    if (!Array.isArray(raw)) {
        return [];
    }
    const out: RecommendTag[] = [];
    for (const item of raw) {
        const tag = normalizeRecommendTag(item);
        if (tag) {
            out.push(tag);
        }
    }
    return out;
}

/** 归一 RecommendTagGroup[]：title 仅取字符串、data 逐项归一；非数组 → 空数组 */
function normalizeRecommendTagGroups(raw: unknown): RecommendTagGroup[] {
    if (!Array.isArray(raw)) {
        return [];
    }
    return raw.map(group => {
        const { title } = (group ?? {}) as { title?: unknown };
        return {
            title: typeof title === 'string' ? title : undefined,
            data: normalizeRecommendTags(
                (group as { data?: unknown } | null)?.data,
            ),
        } satisfies RecommendTagGroup;
    });
}

/**
 * 归一毫秒时间戳：非数值 / 脏值 / 超出 Date 可表示范围一律丢弃
 * 上限即 Date 的极值（±8.64e15），越界会渲染成 Invalid Date
 */
function normalizeTimestamp(raw: unknown): number | undefined {
    if (typeof raw !== 'number' || !Number.isFinite(raw)) {
        return undefined;
    }
    return Math.abs(raw) <= 8.64e15 ? raw : undefined;
}

/**
 * 归一单条评论：插件返回不可信，逐字段校验类型并产出自有快照（不持有插件对象引用）
 * `createAt` 是 wire 旧拼写，内部统一读 `createdAt`；两者都保留以兼容既有插件生态
 * withReplies=false 时丢弃更深层回复——UI 只平铺一层，深层嵌套在边界裁掉，同时防自引用成环
 */
function normalizeComment(raw: unknown, withReplies: boolean): Comment | null {
    if (typeof raw !== 'object' || raw === null) {
        return null;
    }
    const source = raw as Record<string, unknown>;
    const text = typeof source.comment === 'string' ? source.comment : '';
    const nickName =
        typeof source.nickName === 'string' ? source.nickName.trim() : '';
    // 无正文的条目没有展示价值，直接丢弃
    if (!text.trim()) {
        return null;
    }
    // 时间：canonical 优先、wire 旧拼写兜底，各自独立校验（前者是脏值时仍能取到后者）
    const createdAt =
        normalizeTimestamp(source.createdAt) ??
        normalizeTimestamp(source.createAt);
    // 点赞数只认非负整数：负数 / 小数会让紧凑显示与读屏播报的完整数字对不上
    const rawLike = source.like;
    const like =
        typeof rawLike === 'number' &&
        Number.isSafeInteger(rawLike) &&
        rawLike >= 0
            ? rawLike
            : undefined;
    const avatar =
        typeof source.avatar === 'string' && source.avatar.trim()
            ? source.avatar
            : undefined;
    const location =
        typeof source.location === 'string' && source.location.trim()
            ? source.location.trim()
            : undefined;
    return {
        id: typeof source.id === 'string' ? source.id : undefined,
        nickName,
        avatar,
        comment: text,
        like,
        createdAt,
        createAt: createdAt,
        location,
        replies: withReplies
            ? normalizeComments(source.replies, false)
            : undefined,
    } satisfies Comment;
}

/** 归一评论数组：非数组 → 空数组；无效项跳过 */
function normalizeComments(raw: unknown, withReplies: boolean): Comment[] {
    if (!Array.isArray(raw)) {
        return [];
    }
    const out: Comment[] = [];
    for (const item of raw) {
        const comment = normalizeComment(item, withReplies);
        if (comment) {
            out.push(comment);
        }
    }
    return out;
}

/**
 * deprecated 归口方法 → 插件旧方法名（单一源）
 * 老插件只实现旧名时，归口回退调旧名；supportedMethods 探测（sandbox.ts）反用此表识别能力
 */
export const deprecatedMethodFallbacks = {
    getPlaylistInfo: 'getMusicSheetInfo',
    importPlaylist: 'importMusicSheet',
    getRecommendPlaylistTags: 'getRecommendSheetTags',
    getRecommendPlaylistsByTag: 'getRecommendSheetsByTag',
} as const satisfies Partial<
    Record<keyof PluginMethods, keyof PluginDefinition>
>;

/** 归口出站整形的上下文 */
interface NormalizeCtx {
    supportedSearchTypes?: readonly string[];
}

/** 内部合法搜索类型（含 lyric，与 MediaType 一致；'sheet' 是唯一 wire 别名 → 'playlist'） */
const VALID_SEARCH_TYPES: ReadonlySet<MediaType> = new Set([
    'music',
    'album',
    'artist',
    'playlist',
    'lyric',
]);

/**
 * 插件声明的搜索类型（raw，来自不可信插件 / MMKV）→ 内部 MediaType[]
 * 'sheet'→'playlist'、剔除非法值、去重；非数组（未声明 / 脏数据）返 undefined = 未声明，视为支持全部类型
 * 'sheet' 方言到此为止，不外泄到 hooks / UX
 */
export function normalizeSearchTypes(raw: unknown): MediaType[] | undefined {
    if (!Array.isArray(raw)) {
        return undefined;
    }
    const out: MediaType[] = [];
    for (const value of raw) {
        if (typeof value !== 'string') {
            continue;
        }
        const type = (value === 'sheet' ? 'playlist' : value) as MediaType;
        if (VALID_SEARCH_TYPES.has(type) && !out.includes(type)) {
            out.push(type);
        }
    }
    return out;
}

/**
 * 单方法规范化器（K 维强类型）：
 * - args 入参 = 该方法真实签名（调用点已知，强类型）
 * - result 入参 = unknown（插件返回不可信 + 容 deprecated 旧形状 cast）
 * - result 出参 / defaultResult = 该方法真实返回（我们产出，强类型兑正确性）
 */
interface TypedMethodNormalizer<K extends keyof PluginMethods> {
    /** 出站：整形传给插件的参数（如 search 的 sheet↔playlist wire） */
    normalizeArgs?(
        args: Parameters<PluginMethods[K]>,
        ctx: NormalizeCtx,
    ): unknown[];
    /** 入站：整形插件返回（platform 盖章 / sheetItem→playlistItem 等） */
    normalizeResult?(
        result: unknown,
        platform: string,
    ): Awaited<ReturnType<PluginMethods[K]>>;
    /** 方法缺失或返回空时的兜底工厂：每次现造新值，杜绝跨调用/跨插件共享可变兜底 */
    defaultResult(): Awaited<ReturnType<PluginMethods[K]>>;
}

/** 擦除 K 的消费视图：methods.ts 运行时按 union key dispatch 时用（args/result 退化 unknown） */
export interface MethodNormalizer {
    normalizeArgs?(args: unknown[], ctx: NormalizeCtx): unknown[];
    normalizeResult?(result: unknown, platform: string): unknown;
    defaultResult(): unknown;
}

/**
 * 逐方法规范化表（全量覆盖 PluginMethods，新增方法必须补条目、不会静默漏兜底）
 * 'sheet' 方言与旧结果字段（sheetItem）只活在本文件内，不外泄到内部类型 / hooks / UX
 */
export const methodNormalizers: {
    [K in keyof PluginMethods]: TypedMethodNormalizer<K>;
} = {
    search: {
        // 出站：插件声明 supportedSearchType 含 'sheet'（旧插件）则把 'playlist' 换发 'sheet'
        normalizeArgs: (args, ctx) => {
            const [query, page, type] = args;
            const wireType =
                type === 'playlist' &&
                ctx.supportedSearchTypes?.includes('sheet')
                    ? 'sheet'
                    : type;
            return [query, page, wireType];
        },
        normalizeResult: (result, platform) => {
            const r = result as SearchResult<MediaType> | undefined;
            return {
                isEnd: normalizeIsEnd(r?.isEnd),
                data: normalizeMediaItems(r?.data, platform) ?? [],
            };
        },
        defaultResult: () =>
            ({ isEnd: true, data: [] } satisfies SearchResult<MediaType>),
    },
    getMediaSource: {
        defaultResult: () => null,
    },
    getMusicInfo: {
        // 补丁只保留显示信息：剥 platform/id/url（身份 + 音源锚点由合并方 core/player 保留，插件不得改）
        normalizeResult: result => {
            if (!result) {
                return null;
            }
            const patch = { ...(result as Partial<MusicItem>) };
            delete patch.platform;
            delete patch.id;
            delete patch.url;
            return patch;
        },
        defaultResult: () => null,
    },
    getLyric: {
        defaultResult: () => null,
    },
    getAlbumInfo: {
        normalizeResult: (result, platform) => {
            const r = result as AlbumInfoResult | null;
            if (!r) {
                return null;
            }
            return {
                isEnd: normalizeIsEnd(r.isEnd),
                albumItem: r.albumItem
                    ? normalizeMediaItem(r.albumItem, platform)
                    : undefined,
                musicList: normalizeMediaItems(r.musicList, platform),
            } satisfies AlbumInfoResult;
        },
        defaultResult: () => null,
    },
    getArtistWorks: {
        normalizeResult: (result, platform) => {
            const r = result as SearchResult<ArtistMediaType> | undefined;
            return {
                isEnd: normalizeIsEnd(r?.isEnd),
                data: normalizeMediaItems(r?.data, platform) ?? [],
            };
        },
        defaultResult: () => ({ isEnd: true, data: [] }),
    },
    getPlaylistInfo: {
        // 兼容旧插件 getMusicSheetInfo 的 sheetItem：入站统一成 playlistItem
        normalizeResult: (result, platform) => {
            const r = result as (PlaylistInfoResult & SheetInfoResult) | null;
            if (!r) {
                return null;
            }
            const rawItem = r.playlistItem ?? r.sheetItem;
            return {
                isEnd: normalizeIsEnd(r.isEnd),
                playlistItem: rawItem
                    ? normalizeMediaItem(rawItem, platform)
                    : undefined,
                musicList: normalizeMediaItems(r.musicList, platform),
            } satisfies PlaylistInfoResult;
        },
        defaultResult: () => null,
    },
    getTopLists: {
        normalizeResult: (result, platform) => {
            const groups = result as PlaylistGroup[] | undefined;
            return (
                groups?.map(g => ({
                    ...g,
                    data: normalizeMediaItems(g.data, platform) ?? [],
                })) ?? []
            );
        },
        defaultResult: () => [] satisfies PlaylistGroup[],
    },
    getTopListDetail: {
        normalizeResult: (result, platform) => {
            const r = result as TopListInfoResult | undefined;
            return {
                isEnd: normalizeIsEnd(r?.isEnd),
                topListItem: r?.topListItem
                    ? normalizeMediaItem(r.topListItem, platform)
                    : undefined,
                musicList: normalizeMediaItems(r?.musicList, platform) ?? [],
            } satisfies TopListInfoResult;
        },
        defaultResult: () =>
            ({ isEnd: true, musicList: [] } satisfies TopListInfoResult),
    },
    getRecommendPlaylistTags: {
        // 结构归一：pinned / data 强制成数组、逐 tag 校验 id 非空（数字转字符串）、保留扩展字段
        normalizeResult: result => {
            const r = result as RecommendPlaylistTagsResult | undefined;
            return {
                pinned: normalizeRecommendTags(r?.pinned),
                data: normalizeRecommendTagGroups(r?.data),
            } satisfies RecommendPlaylistTagsResult;
        },
        defaultResult: () => ({} satisfies RecommendPlaylistTagsResult),
    },
    getRecommendPlaylistsByTag: {
        normalizeResult: (result, platform) => {
            const r = result as
                | PaginationResponse<PlaylistItemBase>
                | undefined;
            return {
                isEnd: normalizeIsEnd(r?.isEnd),
                data: normalizeMediaItems(r?.data, platform) ?? [],
            } satisfies PaginationResponse<PlaylistItemBase>;
        },
        defaultResult: () =>
            ({
                isEnd: true,
                data: [],
            } satisfies PaginationResponse<PlaylistItemBase>),
    },
    getMusicComments: {
        normalizeResult: result => {
            const r = result as PaginationResponse<Comment> | undefined;
            return {
                isEnd: normalizeIsEnd(r?.isEnd),
                data: normalizeComments(r?.data, true),
            } satisfies PaginationResponse<Comment>;
        },
        defaultResult: () =>
            ({ isEnd: true, data: [] } satisfies PaginationResponse<Comment>),
    },
    importMusicItem: {
        normalizeResult: (result, platform) =>
            result ? normalizeMediaItem(result as MusicItem, platform) : null,
        defaultResult: () => null,
    },
    importPlaylist: {
        normalizeResult: (result, platform) =>
            result
                ? normalizeMediaItems(result as MusicItem[], platform) ?? null
                : null,
        defaultResult: () => null,
    },
};
