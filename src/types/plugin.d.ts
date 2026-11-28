import type { AlbumItemBase } from './album';
import type { ArtistItem, ArtistMediaType } from './artist';
import type { RawLyric } from './lyric';
import type { MediaType } from './media';
import type { LyricItem, MediaSource, MusicItem, QualityKey } from './music';
import type { PlaylistGroup, PlaylistItem, PlaylistItemBase } from './playlist';

/** 分页响应 */
export interface PaginationResponse<T> {
    isEnd?: boolean;
    data?: T[];
}

/** 推荐 tag：只需 id（+可选 title），允许插件携带额外字段原样回传 */
export interface RecommendTag {
    id: string;
    title?: string;
    [k: string]: unknown;
}

/** 一组推荐 tag（分类分组） */
export interface RecommendTagGroup {
    title?: string;
    data: RecommendTag[];
}

/** 评论（getMusicComments） */
export interface Comment {
    id?: string;
    nickName: string;
    avatar?: string;
    comment: string;
    /** 点赞数，只读展示；协议无点赞能力 */
    like?: number;
    /** 发表时间（毫秒时间戳），归一后的规范字段，UI 只读这个 */
    createdAt?: number;
    /**
     * 发表时间的插件协议拼写，属对外 wire 契约不可改名
     * 插件按此名返回，归一时同步到 createdAt
     *
     * @deprecated 仅供插件侧填写与归一读取，应用内一律用 createdAt
     */
    createAt?: number;
    location?: string;
    /** 回复；只保留一层，更深层级在归一时裁掉 */
    replies?: Comment[];
}

/** 插件用户自定义变量 */
export interface UserVariable {
    key: string;
    name?: string;
    hint?: string;
}

/** 媒体类型 → item 映射（search 泛型用） */
export interface MediaItemByType {
    music: MusicItem;
    album: AlbumItemBase;
    artist: ArtistItem;
    playlist: PlaylistItemBase;
    lyric: LyricItem;
}

export interface SearchResult<T extends MediaType> {
    isEnd?: boolean;
    data: MediaItemByType[T][];
}
export interface AlbumInfoResult {
    isEnd?: boolean;
    albumItem?: Partial<AlbumItemBase>;
    musicList?: MusicItem[];
}
export interface PlaylistInfoResult {
    isEnd?: boolean;
    playlistItem?: Partial<PlaylistItemBase>;
    musicList?: MusicItem[];
}
/** @deprecated 用 PlaylistInfoResult（配 getPlaylistInfo） */
export interface SheetInfoResult {
    isEnd?: boolean;
    /** @deprecated 用 PlaylistInfoResult.playlistItem */
    sheetItem?: Partial<PlaylistItemBase>;
    musicList?: MusicItem[];
}
export interface TopListInfoResult {
    isEnd?: boolean;
    topListItem?: Partial<PlaylistItemBase>;
    musicList?: MusicItem[];
}
export interface RecommendPlaylistTagsResult {
    pinned?: RecommendTag[];
    data?: RecommendTagGroup[];
}
/** @deprecated 用 RecommendPlaylistTagsResult */
export interface RecommendSheetTagsResult {
    pinned?: RecommendTag[];
    data?: RecommendTagGroup[];
}

/**
 * 插件定义：插件模块导出的契约
 * 方法名 / 签名与桌面版 + 既有插件生态对齐（wire 契约）
 */
export interface PluginDefinition {
    platform: string;
    version?: string;
    appVersion?: string;
    srcUrl?: string;
    primaryKey?: string[];
    /** @deprecated 改用 getMediaSource 结果的 maxAge 控制 URL 新鲜度 */
    cacheControl?: 'cache' | 'no-cache' | 'no-store';
    defaultSearchType?: MediaType;
    supportedSearchType?: MediaType[];
    author?: string;
    description?: string;
    userVariables?: UserVariable[];
    hints?: Record<string, string[]>;

    search?<T extends MediaType>(
        query: string,
        page: number,
        type: T,
    ): Promise<SearchResult<T>>;
    getMediaSource?(
        musicItem: MusicItem,
        quality: QualityKey,
    ): Promise<MediaSource | null>;
    getMusicInfo?(musicItem: MusicItem): Promise<Partial<MusicItem> | null>;
    getLyric?(musicItem: MusicItem): Promise<RawLyric | null>;
    getAlbumInfo?(
        albumItem: AlbumItemBase,
        page: number,
    ): Promise<AlbumInfoResult | null>;
    getArtistWorks?<T extends ArtistMediaType>(
        artistItem: ArtistItem,
        page: number,
        type: T,
    ): Promise<SearchResult<T>>;
    getTopLists?(): Promise<PlaylistGroup[]>;
    getTopListDetail?(
        topListItem: PlaylistItemBase,
        page: number,
    ): Promise<TopListInfoResult>;
    getMusicComments?(
        musicItem: MusicItem,
        page?: number,
    ): Promise<PaginationResponse<Comment>>;
    importMusicItem?(urlLike: string): Promise<MusicItem | null>;

    /** 歌单详情（拉取曲目列表） */
    getPlaylistInfo?(
        playlist: PlaylistItemBase,
        page: number,
    ): Promise<PlaylistInfoResult | null>;
    /** @deprecated 用 getPlaylistInfo */
    getMusicSheetInfo?(
        sheetItem: PlaylistItem,
        page: number,
    ): Promise<SheetInfoResult | null>;
    /** 导入歌单（从分享链接） */
    importPlaylist?(urlLike: string): Promise<MusicItem[] | null>;
    /** @deprecated 用 importPlaylist */
    importMusicSheet?(urlLike: string): Promise<MusicItem[] | null>;
    /** 推荐歌单分类标签 */
    getRecommendPlaylistTags?(): Promise<RecommendPlaylistTagsResult>;
    /** @deprecated 用 getRecommendPlaylistTags */
    getRecommendSheetTags?(): Promise<RecommendSheetTagsResult>;
    /** 按标签取推荐歌单 */
    getRecommendPlaylistsByTag?(
        tag: RecommendTag,
        page?: number,
    ): Promise<PaginationResponse<PlaylistItemBase>>;
    /** @deprecated 用 getRecommendPlaylistsByTag */
    getRecommendSheetsByTag?(
        tag: RecommendTag,
        page?: number,
    ): Promise<PaginationResponse<PlaylistItemBase>>;
}
