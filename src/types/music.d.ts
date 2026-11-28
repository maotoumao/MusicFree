import type { RawLyric } from './lyric';
import type { MediaBase } from './media';

/** 音质档位 */
export type QualityKey = 'low' | 'standard' | 'high' | 'super';

/** 单音质音源（getMediaSource 返回 / MusicItem.source 内嵌） */
export interface MediaSource {
    url?: string;
    headers?: Record<string, string>;
    userAgent?: string;
    quality?: QualityKey;
    size?: number;
    /** URL 复用 TTL（秒）；getMediaSource 结果用，替代插件级 cacheControl，JS mediaCache 据此判过期 */
    maxAge?: number;
}

/**
 * 歌曲 DTO：插件返回的不可变快照
 * 内部态（排序 / 下载 / 关联歌词）另存 MediaMeta side-table，禁 mutate 到本对象
 * 跨端共享核心：字段名与桌面版 / 插件生态 wire 契约一致
 */
export interface MusicItem extends MediaBase {
    title: string;
    artist: string;
    album: string;
    artwork: string;
    /** 时长（秒） */
    duration: number;
    alias?: string;
    /** 兜底音源 URL */
    url?: string;
    /** 多音质音源映射 */
    source?: Partial<Record<QualityKey, MediaSource>>;
    /** 音质档位元信息 */
    qualities?: Partial<
        Record<QualityKey, { url?: string; size?: string | number }>
    >;
    lyric?: RawLyric;
    /** @deprecated 用 lyric */
    lrc?: string;
    /** @deprecated 用 lyric */
    rawLrc?: string;
}

/** 歌词搜索结果项：一首歌 + 命中的原始歌词文本（媒体实体，≈ MusicItem） */
export interface LyricItem extends MusicItem {
    rawLrcTxt?: string;
}
