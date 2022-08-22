declare namespace IAlbum {
    export interface IAlbumItem {
        artwork: string;
        title: string;
        date: string;
        artist: string;
        description?: string;
        platform: string;
        id: string;
        [k: string]: any;
    }
}