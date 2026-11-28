import type { IConfig } from '@/core/config';
import type { IMediaMeta } from '@/core/mediaMeta';
import type { IPlayer } from '@/core/player';
import type { IPluginManager } from '@/core/plugin';
import type { LyricLine, MusicItem, ParsedLyric } from '@/types';

/** 一份歌词文本：正文与可选的译文，两者都是原始 LRC / 纯文本 */
export interface LyricText {
    rawLrc: string;
    translation?: string;
}

/** 歌词元信息：LRC 头部的 [k:v] 标签 */
export interface LyricMeta {
    /** 时间轴偏移（秒；由 [offset:] 的毫秒值换算） */
    offset?: number;
    /** 其余标签（ti/ar/al/by 等）原样保留 */
    [tag: string]: string | number | undefined;
}

/** parseLyric 的可选参数 */
export interface ParseLyricOptions {
    /** 翻译轨：**两轨都有时间轴**时按时间戳合并，否则按非空行的行号逐行配 */
    translation?: string;
}

/** parseLyric 的结果 */
export interface ParseLyricResult {
    lines: ParsedLyric;
    meta: LyricMeta;
    /** 是否含真实时间轴（false = 纯文本降级，无当前行概念） */
    timed: boolean;
    /**
     * 原文里的非空正文行数
     * 与 `lines.length` 的区别：一行多时间戳会展开成多条播放行，这里只算一行
     */
    sourceLines: number;
}

/** 当前行定位结果；index 为 -1、line 为 null 表示尚未进入第一行 */
export interface ActiveLine {
    index: number;
    line: LyricLine | null;
}

/**
 * 消费方（桌面歌词等）要显示的当前歌词内容，由 lyric 算好
 * line=有一行可显示（定时当前行 或 纯文本歌词的开头）；none=无词/加载中/定时未进首行，消费方自行兜底歌名
 */
export type LyricContent = { kind: 'line'; line: LyricLine } | { kind: 'none' };

/** 歌词内容状态：loading=取词中，loaded=已解析出行，unavailable=无词 / 取词失败 */
export type LyricStatus = 'loading' | 'loaded' | 'unavailable';

/**
 * 当前这份词实际的来源；比存储的 LyricOverride 多一个 plugin——没有用户指定时就是它
 * associated 即使没取到词也照样上报：用户需要知道「关联着但此刻拉不到」，
 * 而不是看着一片空白以为从没关联过
 */
export type LyricOrigin =
    | { kind: 'plugin' }
    | { kind: 'associated'; musicItem: MusicItem }
    | { kind: 'custom' };

/** 歌词内容（每首歌一次、低频变化） */
export interface LyricState {
    status: LyricStatus;
    lines: ParsedLyric;
    meta: LyricMeta;
    hasTranslation: boolean;
    /** 是否含真实时间轴（false = 纯文本降级，无当前行、不可按行定位） */
    timed: boolean;
    /** 这份词是插件默认的、关联来的、还是用户自己编的（供歌词页决定给不给「恢复默认歌词」） */
    origin: LyricOrigin;
}

/** 歌词时间轴偏移，单位为秒 */
export interface LyricOffset {
    /** 有效偏移 = LRC [offset:] − 用户手动偏移；seek 使用 line.time + effective，定位使用 position − effective */
    effective: number;
    /** 用户手动偏移，正值表示提前、负值表示延迟，供偏移面板回显 */
    user: number;
}

/** 某首歌此刻实际会用的那份词与它的来源；text 为 null 表示取不到 */
export interface EffectiveLyric {
    text: LyricText | null;
    origin: LyricOrigin;
}

/** 歌词管理器接口：由 setup 启动，并提供偏移命令供 UI 调整当前歌曲 */
export interface ILyric {
    /** 启动管理器：订阅 player 的切歌和进度事件，并首次取词；幂等 */
    setup(): void;
    /** 预览当前歌曲的手动偏移（单位为秒，正值表示提前）：立即应用但不持久化，供拖动实时预览 */
    previewLyricOffset(seconds: number): void;
    /** 提交当前歌曲的手动偏移（单位为秒，正值表示提前）：应用并持久化 */
    commitLyricOffset(seconds: number): void;
    /** 将当前歌曲的手动偏移重置为 0 并持久化 */
    resetLyricOffset(): void;
    /**
     * 关联歌词：取 source 所属插件的权威完整歌词，把 target 的歌词来源指向 source；成功返回 true
     * 文本落进 source 的缓存、不进侧表；覆盖 target 已有的任何来源（含手工编辑的词）
     * target 是当前播放歌时立即重渲染，否则只持久化、下次播放该歌生效
     */
    associateLyric(target: MusicItem, source: MusicItem): Promise<boolean>;
    /**
     * 恢复默认歌词：清掉 target 的歌词来源指定（关联与手工编辑一并清），回落插件默认词
     * target 是当前播放歌时立即重取重渲染，否则只清除
     */
    resetLyric(target: MusicItem): Promise<void>;
    /**
     * 取 target 此刻实际会用的那份词与来源，供编辑器预填
     * 与播放取词同一条链路（自定义词 / 关联来源的词 / 插件默认词），因此也共用文件缓存
     */
    getEffectiveLyric(target: MusicItem): Promise<EffectiveLyric>;
    /**
     * 保存用户手工编辑的歌词，覆盖 target 已有的任何来源（含关联）
     * 正文为空白（或传 null）等同于 resetLyric——清除自定义词、回落插件默认词
     * 超长文本按 LYRIC_MAX_LENGTH 兜底截断；写盘失败会 reject，由调用方提示
     * target 是当前播放歌时立即重渲染，否则只落库、下次播放该歌生效
     */
    setCustomLyric(target: MusicItem, text: LyricText | null): Promise<void>;
    /** 订阅「当前要显示的歌词内容」；订阅即回放当前快照，返回退订。供桌面歌词等 core 用 */
    subscribeLyricContent(cb: (content: LyricContent) => void): () => void;
}

/** 构造注入依赖 */
export interface LyricDeps {
    /** 自动搜索开关 */
    config: IConfig;
    /** 切歌 / 进度事件 + 当前歌 / 进度快照 */
    player: IPlayer;
    /** 按歌路由取词 */
    pluginManager: IPluginManager;
    /** 读取和保存单曲的手动歌词偏移 */
    mediaMeta: IMediaMeta;
}
