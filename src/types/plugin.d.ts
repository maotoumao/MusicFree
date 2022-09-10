declare namespace IPlugin {
  export interface IMusicTrackResult {
    headers?: Record<string, string>;
    url: string;
    userAgent?: string;
  }

  export interface ISearchResult<T extends ICommon.SupportMediaType> {
    isEnd?: boolean;
    data: ICommon.SupportMediaItemBase[T][];
  }

  export type ISearchResultType = ICommon.SupportMediaType;

  type ISearchFunc = <T extends ICommon.SupportMediaType>(
    query: string,
    page: number,
    type: T,
  ) => Promise<ISearchResult<T>>;

  type IQueryArtistWorksFunc = <
    T extends IArtist.ArtistMediaType,
  >(
    artistItem: IArtist.IArtistItem,
    page: number,
    type: T,
  ) => Promise<ISearchResult<T>>;

  interface IPluginDefine {
    /** 来源名 */
    platform: string;
    /** 匹配的版本号 */
    appVersion?: string;
    /** 主键，会被存储到mediameta中 */
    primaryKey: string[];
    /** 默认搜索类型 */
    defaultSearchType?: ICommon.SupportMediaType;
    /** 搜索 */
    search?: ISearchFunc;
    /** 获取根据音乐信息获取url */
    getMusicTrack?: (
      musicItem: IMusic.IMusicItemBase,
    ) => Promise<IMusicTrackResult | null>;
    /** 根据主键去查询歌曲信息 */
    getMusicInfo?: (musicBase: ICommon.IMediaBase) => Promise<IMusic.IMusicItem | null>;
    /** 获取歌词 */
    getLyric?: (musicItem: IMusic.IMusicItemBase) => Promise<ILyric.ILyricSource | null>;
    /** 获取专辑信息，里面的歌曲不要分页 */
    getAlbumInfo?: (
      albumItem: IAlbum.IAlbumItemBase,
    ) => Promise<IAlbum.IAlbumItem | null>;
    /** 获取作品，有分页 */
    queryArtistWorks?: IQueryArtistWorksFunc;
  }

  export interface IPluginInstance extends IPluginDefine {
    /** 内部属性 */
    /** 插件路径 */
    _path: string;
  }

  type R = Required<IPluginInstance>;
  export type IPluginInstanceMethods = {
    [K in keyof R as R[K] extends (...args: any) => any ? K : never]: R[K];
  };
}
