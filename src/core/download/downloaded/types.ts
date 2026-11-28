/**
 * 已下载库的契约层：只放类型与常量
 *
 * 「已下载」= 本机下载过的歌与它们的文件产物。与传输侧的分界是**该不该活过完成那一刻**：
 * 传输态完成即消散，这里的条目要长期保留——它既是下载页「已完成」的数据源，
 * 也是「这首歌下过没」与离线播放选文件的判据
 */
import type { DeepReadonly, MusicItem, QualityKey } from '@/types';

/**
 * 已下载库存储（与活动队列 registry **分 store**）：registry 只留在途任务、完成即移出，
 * 而已下载库要长期保留，故独立存。一 mediaKey 一 key（避免整表写回）
 */
export const DOWNLOADED_STORE_ID = 'music.Downloaded';

/** 已下载库结构版本（变更时 +1 并迁移） */
export const DOWNLOADED_SCHEMA_VERSION = 1;

/** 已下载的文件产物（一首歌只留一份） */
export interface DownloadedFile {
    /** 最终文件绝对路径 */
    readonly path: string;
    /** 容器扩展名（小写无点） */
    readonly extension: string;
    readonly sizeBytes: number;
    /** 完成时间戳（epoch 毫秒） */
    readonly completedAt: number;
    /**
     * 这份文件实际是哪一档（源解析命中的音质），不是当初请求的那一档
     * 是文件自身的属性：判「要不要为更高音质重下」与面板「音质 · 无损」都读它
     */
    readonly resolvedQuality: QualityKey;
}

/**
 * 一首「下载过的歌」：插件身份快照 + 它在本机的那份文件
 * 一首歌一条 = 下载页列表里一行；它同时是「这首歌下过没」的判据
 * 下载态不写回 item（插件 DTO 铁律）；字段名与 JSON 结构是持久化 wire 契约
 *
 * **只存一份文件**（设计 §5）：下新音质即替换旧文件。多档共存会把「同一首歌在库里出现多行」
 * 连同代表文件挑选、副本隐藏一并带进来——为一个没人要的能力付出结构复杂度
 */
export interface DownloadedEntry {
    /** 下载完成时的 MusicItem 深冻结快照（插件 DTO 铁律：不 mutate 下载态进 item） */
    readonly item: DeepReadonly<MusicItem>;
    /** 业务身份 = utils 的 mediaKey(ref)；本库索引，一首歌一条 */
    readonly mediaKey: string;
    /** 这首歌在本机的文件 */
    readonly file: DownloadedFile;
}

/** 落一份已下载文件的入参（下载完成入账） */
export interface RecordDownloadedFileInput {
    readonly item: DeepReadonly<MusicItem>;
    readonly file: DownloadedFile;
}

/**
 * 入账结果：`supersededPath` = 被本次替换掉、已无人引用的旧文件路径（调用方负责删盘）
 * 落库失败返 null，与「入账成功但没顶掉任何文件」（`{}`）区分开
 */
export type RecordDownloadedFileResult = { supersededPath?: string } | null;
