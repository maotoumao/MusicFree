/**
 * 媒体身份：platform + id 唯一确定一个媒体，是全 app 的索引基元
 * 队列引用 / 缓存 key / side-table 索引都以它为键
 * 跨端共享核心：与桌面版 IMediaBase 的身份语义一致
 */
export interface MediaRef {
    platform: string;
    id: string;
}

/**
 * 媒体实体基：身份 + 插件可能携带的额外字段
 * 所有媒体实体（MusicItem / AlbumItem / ArtistItem / PlaylistItem）继承它
 * 约定：`XItemBase` = 列表/搜索形态（无内嵌 musicList）；`XItem` = 详情形态（+musicList）
 */
export interface MediaBase extends MediaRef {
    [k: string]: unknown;
}

/**
 * 插件搜索/媒体类型（内部统一用 playlist，一个词一个概念）
 * 这些值即传给插件的 search type wire 值；music/album/artist/lyric 内外一致
 * 唯一方言：旧插件把「歌单」搜索类型写作 'sheet'——core/plugin 的 normalizer 在出站
 * 运行时将 'playlist' 换发 'sheet'（判插件 supportedSearchType，不用 @ts-expect-error），内部类型里不出现 'sheet'
 */
export type MediaType = 'music' | 'album' | 'artist' | 'playlist' | 'lyric';
