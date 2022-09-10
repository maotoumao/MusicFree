declare namespace IMusic {
    export interface IMusicItemBase {
        /** 歌曲在平台的唯一编号 */
        id: string;
        /** 平台 */
        platform: string;
        /** 其他属性 */
        [k: keyof IMusicItem]: IMusicItem[k];
    }

    export interface IMusicItem {
        /** 歌曲在平台的唯一编号 */
        id: string;
        /** 平台 */
        platform: string;
        /** 作者 */
        artist: string;
        /** 标题 */
        title: string;
        /** 时长(s) */
        duration: number;
        /** 专辑名 */
        album: string;
        /** 专辑封面图 */
        artwork: string;
        /** 音源 */
        url?: string;
        /** 歌词URL */
        lrc?: string;
        /** 歌词 */
        rawLrc?: string;
        /** 其他可以被序列化的信息 */
        [k: string]: any;
        /** 内部信息 */
        [k: symbol]: any;
    }
}
