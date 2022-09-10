declare namespace ILyric {
    export interface ILyricItem extends ICommon.IMediaBase {}

    export interface ILyricSource {
        lrc?: string;
        rawLrc?: string;
    }

    export interface IParsedLrcItem {
        /** 时间 s */
        time: number;
        /** 歌词 */
        lrc: string;
    }

    export type IParsedLrc = IParsedLrcItem[];
}
