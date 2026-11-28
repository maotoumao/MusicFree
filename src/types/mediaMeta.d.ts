import type { MusicItem, QualityKey } from './music';

/**
 * 用户为某首歌指定的歌词来源；两种方式互斥、后写覆盖，没有记录即用插件默认词
 * 只记「指定了什么」，歌词文本另存于文件（见 core/lyric 的 fileStore）——
 * 侧表是一个 key 一个 JSON blob，几 KB 文本放进来会让改任何字段都重写整份文本
 */
export type LyricOverride =
    | {
          /** 搜索关联到另一首歌；musicItem 供展示来源与按需重新取词，不含文本 */
          kind: 'associated';
          musicItem: MusicItem;
      }
    | {
          /** 用户手工编辑；文本在 lyric/custom/ 下按媒体摘要命名 */
          kind: 'custom';
      };

/**
 * 富元数据 side-table 值：按 MediaRef 索引另存，绝不 mutate 到 DTO 上
 * 取代 legacy 贴在 MusicItem 的 `$` / Symbol 内部字段
 * 这是本地存储 schema，与桌面版共享大部分字段但不等同——跨端传输另有 wire 形状，
 * 由 core/mediaMeta 的 snapshot / restore 双向转换
 */
export interface MediaMeta {
    /** 下载信息 */
    downloadData?: {
        path: string;
        quality: QualityKey;
    };
    /** 本地原文件路径（本地音乐扫描写入；区别于下载来的 downloadData） */
    localPath?: string;
    /** 用户指定的歌词来源（关联某首歌 / 手工编辑）；无则用插件默认词 */
    lyricOverride?: LyricOverride;
    /** 歌词时间轴偏移（秒，对齐桌面版） */
    lyricOffset?: number;
}
