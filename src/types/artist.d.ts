declare namespace IArtist {

  export interface IArtistItemBase {
    name: string;
    id: string;
    fans?: number;
    description?: string;
    platform?: string;
    avatar: string;
    worksNum: number;
  }
  export interface IArtistItem extends IArtistItemBase {
    musicList: IMusic.IMusicItemBase,
    albumList: IAlbum.IAlbumItemBase,
    [k: string]: any;
  }
}
