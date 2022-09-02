declare namespace IPlugin {
  export interface IMusicTrackResult {
    headers?: Record<string, string>;
    url: string;
  }

  export interface ISearchResult {
    _isEnd?: boolean;
    // 可能还有歌手页等等
    artist?: Array<IArtist.IArtistItem>;
    music?: Array<IMusic.IMusicItem>;
    album?: Array<IAlbum.IAlbumItem>;
  }

  export type ISearchResultType = ICommon.SupportMediaType;

  interface IPluginDefine {
    /** 来源名 */
    platform: string;
    /** 匹配的版本号 */
    appVersion?: string;
    /** 默认搜索类型 */
    defaultSearchType?: ICommon.SupportMediaType;
    /** 搜索 */
    search?: (
      keyword: string,
      page?: number,
      type?: ICommon.SupportMediaType,
    ) => Promise<ISearchResult>;
    /** 获取根据音乐信息获取url */
    getMusicTrack?: (
      musicItem: IMusic.IMusicItemBase,
    ) => Promise<IMusicTrackResult | null>;
    /** 获取歌词 */
    getLyric?: (musicItem: IMusic.IMusicItemBase) => Promise<string>;
    /** 获取专辑信息 */
    getAlbumInfo?: (
      albumItem: IAlbum.IAlbumItem,
    ) => Promise<IMusic.IMusicItem[] | null>;
    /** 获取作者信息 */
    getArtistInfo?: (
      artistItem: IArtist.IArtistItem,
    ) => Promise<Omit<ISearchResult, 'artist'>>;
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
