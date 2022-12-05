declare namespace IMusic {
    export interface IMusicItemBase extends ICommon.IMediaBase {
        /** 其他属性 */
        [k: keyof IMusicItem]: IMusicItem[k];
    }

    /** 音质 */
    export type IQualityKey = 'low' | 'standard' | 'high' | 'super';
    export type IQuality = Record<
        IQualityKey,
        {
            url?: string;
            size?: string | number;
        }
    >;

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
        /** 默认音源 */
        url?: string;
        /** 歌词URL */
        lrc?: string;
        /** 歌词 */
        rawLrc?: string;
        /** 音质信息 */
        qualities?: IQuality;
        /** 其他可以被序列化的信息 */
        [k: string]: any;
        /** 内部信息 */
        [k: symbol]: any;
    }
}
