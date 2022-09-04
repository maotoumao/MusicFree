declare namespace IPlugin {
  export interface IMusicTrackResult {
    headers?: Record<string, string>;
    url: string;
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
    /** 默认搜索类型 */
    defaultSearchType?: ICommon.SupportMediaType;
    /** 搜索 */
    search?: ISearchFunc;
    /** 获取根据音乐信息获取url */
    getMusicTrack?: (
      musicItem: IMusic.IMusicItemBase,
    ) => Promise<IMusicTrackResult | null>;
    /** 获取歌词 */
    getLyric?: (musicItem: IMusic.IMusicItemBase) => Promise<ILyric.ILyricSource>;
    /** 获取专辑信息[分页] */
    getAlbumInfo?: (
      albumItem: IAlbum.IAlbumItemBase,
    ) => Promise<IAlbum.IAlbumItem | null>;
    /** 获取作品 */
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
