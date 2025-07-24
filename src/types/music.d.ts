declare namespace IMusic {
    export interface IMusicItemBase extends ICommon.IMediaBase {
        /** 其他属性 */
        [k: keyof IMusicItem]: IMusicItem[k];
    }

    /** 音质 */
    export type IQualityKey = "low" | "standard" | "high" | "super";
    export type IQuality = Record<
        IQualityKey,
        {
            url?: string;
            size?: string | number;
        }
    >;

    // 音源定义
    export interface IMediaSource {
        headers?: Record<string, string>;
        /** 兜底播放 */
        url?: string;
        /** UA */
        userAgent?: string;
        /** 音质 */
        quality?: IMusic.IQualityKey;
        /** 大小 */
        size?: number;
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
        /** 别名 */
        alias?: string;
        /** 时长(s) */
        duration: number;
        /** 专辑名 */
        album: string;
        /** 专辑封面图 */
        artwork: string;
        /** 默认音源 */
        url?: string;
        /** 音源 */
        source?: Partial<Record<IQualityKey, IMediaSource>>;
        /** 歌词 */
        lyric?: ILyric.ILyricSource;
        /** @deprecated 歌词URL */
        lrc?: string;
        /** @deprecated 歌词（原始文本 有时间戳） */
        rawLrc?: string;
        /** 音质信息 */
        qualities?: IQuality;
        /** 其他可以被序列化的信息 */
        [k: string]: any;
        /** 内部信息 */
        [k: symbol]: any;
    }

    export interface IMusicItemCache extends IMusicItem {
        $localLyric?: ILyric.ILyricSource;
    }
}
