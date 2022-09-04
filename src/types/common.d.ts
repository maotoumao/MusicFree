declare namespace ICommon {
  /** 支持搜索的媒体类型 */
  export type SupportMediaType = 'music' | 'album' | 'artist';

  /** 媒体定义 */
  export type SupportMediaItemBase = {
    music: IMusic.IMusicItemBase;
    album: IAlbum.IAlbumItemBase;
    artist: IArtist.IArtistItemBase;
  };

  export type IMediaBase = {
    id: string;
    platform: string;
    [k: string]: any;
    [k: symbol]: any;
  };

  export type IMediaMeta = {
    localLrc?: string;
    lrc?: string;
    associatedLrc?: IMediaBase;
    id?: string;
    platform?: string;
    [k: string]: any;
    [k: symbol]: any;
  };
}
