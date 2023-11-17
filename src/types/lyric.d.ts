declare namespace ILyric {
    export interface ILyricItem extends IMusic.IMusicItem {
        /** 歌词（无时间戳） */
        rawLrcTxt?: string;
    }

    export interface ILyricSource {
        lrc?: string;
        rawLrc?: string;
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
