declare namespace ICommon {
    /** 支持搜索的媒体类型 */
    export type SupportMediaType =
        | "music"
        | "album"
        | "artist"
        | "sheet"
        | "lyric";

    /** 媒体定义 */
    export type SupportMediaItemBase = {
        music: IMusic.IMusicItemBase;
        album: IAlbum.IAlbumItemBase;
        artist: IArtist.IArtistItemBase;
        sheet: IMusic.IMusicSheetItemBase;
        lyric: ILyric.ILyricItem;
    };

    export type IUnique = {
        id: string;
        [k: string | symbol]: any;
    };

    export type IMediaBase = {
        id: string;
        platform: string;
        $?: any;
        [k: symbol]: any;
        [k: string]: any;
    };

    /** 一些额外信息 */
    export type IMediaMeta = {
        /** 关联歌词信息 */
        associatedLrc?: IMediaBase;
        /** 是否下载过 TODO: 删去 */
        downloaded?: boolean;
        /** 本地下载路径 */
        localPath?: string;
        /** 补充的音乐信息 */
        mediaItem?: Partial<IMediaBase>;
        /** 歌词偏移 */
        lyricOffset?: number;

        lrc?: string;
        headers?: Record<string, any>;
        url?: string;
        id?: string;
        platform?: string;
        qualities?: IMusic.IQuality;
        $?: {
            local?: {
                localLrc?: string;
                [k: string]: any;
            };
            [k: string]: any;
        };
        [k: string]: any;
        [k: symbol]: any;
    };

    export type WithMusicList<T> = T & {
        musicList?: IMusic.IMusicItem[];
    };

    export type PaginationResponse<T> = {
        isEnd?: boolean;
        data?: T[];
    };

    export interface IPoint {
        x: number;
        y: number;
    }
}
