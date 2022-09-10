declare namespace IAlbum {
    export interface IAlbumItemBase extends ICommon.IMediaBase {
        artwork: string;
        title: string;
        date: string;
        artist: string;
        description?: string;
    }

    export interface IAlbumItem extends IAlbumItemBase {
        musicList: IMusic.IMusicItem[];
    }
}
