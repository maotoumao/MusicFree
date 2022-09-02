declare namespace IAlbum {
    export interface IAlbumItemBase {
        artwork: string;
        title: string;
        date: string;
        artist: string;
        description?: string;
        platform: string;
        id: string;
        [k: string]: any;
    }

    export interface IAlbumItem extends IAlbumItemBase {
        musicList: IMusic.IMusicItem[]
        
    }
}