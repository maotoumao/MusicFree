declare namespace IPlugin {
  export interface IPlayResult {
    headers?: Record<string, string>;
    url: string;
  }

  export interface ISearchResult {
    // 可能还有歌手页等等
    // artist?: Artist
    music?: Array<IMusic.IMusicItem>;
    album?: Array<IAlbum.IAlbumItem>;
  }

  export type ISearchResultType = ICommon.SupportMediaType;

  export interface IPluginInstance {
    /** 来源名 */
    platform: string;
    /** 匹配的版本号 */
    appVersion?: string;
    getMusicTrack?: (musicItem: MusicItemBase) => Promise<IPlayResult | null>;
    search?: (keyword: string, page?: number) => Promise<ISearchResult>;
    getAlbumInfo?: (albumItem: IAlbum.IAlbumItem) => Promise<IMusic.IMusicItem[] | null>;
  }
}
