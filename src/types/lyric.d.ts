declare namespace ILyric {
    export interface ILyricItem extends IMusic.IMusicItem {
        /** 歌词（无时间戳） */
        rawLrcTxt?: string;
    }

    export interface ILyricSource {
        /** 歌词url */
        lrc?: string;
        /** 纯文本 */
        rawLrc?: string;
        /** 语言 */
        lang?: string;
        /** 其他版本 key: 语言代码 value: 歌词 */
        versions?: Record<string, Omit<ILyricSource, 'versions'>>;
    }

    export interface IParsedLrcItem {
        /** 时间 s */
        time: number;
        /** 歌词 */
        lrc: string;
        /** 下标 */
        index?: number;
    }

    export type IParsedLrc = IParsedLrcItem[];
}
