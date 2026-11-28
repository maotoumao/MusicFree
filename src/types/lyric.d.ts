/** 歌词内容：插件返回 / 关联歌词共用（原始未解析形态） */
export interface RawLyric {
    /** 纯文本歌词（LRC 时间轴格式） */
    rawLrc?: string;
    /** 纯文本翻译歌词 */
    translation?: string;
    /** @deprecated 用 rawLrc；歌词 URL */
    lrc?: string;
}

/** 一行带时间戳的歌词 */
export interface LyricLine {
    /** 时间（秒） */
    time: number;
    /** 歌词正文 */
    text: string;
    /** 对应翻译，仅在合并了翻译轨后存在 */
    translation?: string;
    /** 在有序歌词中的下标 */
    index?: number;
}

/** 解析后的歌词（按时间升序的歌词行） */
export type ParsedLyric = LyricLine[];
