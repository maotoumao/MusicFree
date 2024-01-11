declare namespace ILyric {
    export interface ILyricItem extends IMusic.IMusicItem {
        /** 歌词（无时间戳） */
        rawLrcTxt?: string;
    }

    export interface ILyricSource {
        /** @deprecated 歌词url */
        lrc?: string;
        /** 纯文本格式歌词 */
        rawLrc?: string;
        /** 纯文本格式的翻译 */
        translation?: string;
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
