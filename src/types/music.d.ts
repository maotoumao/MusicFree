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
        /**
         * 是否由「歌单订阅同步」拉进来的
         *
         * 用途：区分「同步来的歌」和「用户自己手动加的歌」。
         * 这是同步时不会把用户手动收藏冲掉的唯一依据。
         * 用 $ 前缀（与 $timestamp / $sortIndex 一致）避免和插件返回的原始字段冲突。
         */
        $sync?: {
            fromSubscription: true;
            syncedAt: number;
        };
        /** 其他可以被序列化的信息 */
        [k: string]: any;
        /** 内部信息 */
        [k: symbol]: any;
    }

    export interface IMusicItemCache extends IMusicItem {
        $localLyric?: ILyric.ILyricSource;
    }
}
