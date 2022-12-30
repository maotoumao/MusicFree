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
        $?: any;
        [k: symbol]: any;
        [k: string]: any;
    };

    /** 一些额外信息 */
    export type IMediaMeta = {
        lrc?: string;
        associatedLrc?: IMediaBase;
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
}
