declare namespace IAlbum {
    export interface IAlbumItemBase extends ICommon.IMediaBase {
        artwork?: string;
        title: string;
        date?: string;
        artist?: string;
        description: string;
        /** 专辑内有多少作品 */
        worksNum?: number;
    }

    export interface IAlbumItem extends IAlbumItemBase {
        musicList: IMusic.IMusicItem[];
    }
}
