/**
 * 传输侧的契约层：只放类型与常量，不实现下载行为
 *
 * 「传输」= 一首歌从入队到文件落盘之间的全过程。完成那一刻它就毕业出这一侧，
 * 交给 `../downloaded` 长期持有——故这里的所有类型都是**短命的**。
 *
 * 里面混着两种契约，改动时必须分清楚：
 * - **持久化 wire**（`DOWNLOAD_STORE_ID` / schema 版本 / `ActiveDownloadRecord` 的字段名）
 *   —— 写进用户磁盘，改动必须保持兼容，或通过升版本并迁移处理
 * - **协作者之间的共同语言**（`OwnerLookup` / `DownloadSource` 等）—— 改动自由
 */
import type { DownloadFailureReason } from './failure';
import type { DeepReadonly, MusicItem, QualityKey } from '@/types';

/**
 * 活动队列持久化 wire 契约：store=`App.download`，一条下载一个 MMKV key（按 mediaKey）
 * key 名与 JSON 结构冻结，改动导致用户下载记录不兼容
 */
export const DOWNLOAD_STORE_ID = 'App.download';
/** registry 结构版本（变更时 +1 并迁移） */
export const DOWNLOAD_SCHEMA_VERSION = 1;

/**
 * 活动态四态：registry 只持久化这些
 * - `pending` 已入队待调度
 * - `downloading` 传输中
 * - `paused` 暂停（保留 `.part`）
 * - `failed` 失败（可重试）
 *
 * 取消不是记录态：取消即从 registry 移除（对齐 download.md 的 STOPPED 瞬态动作）；
 * 完成也不是——它改由已下载库持有，故门面的 `DownloadRecordState` 才在此之上补一个 `done`
 */
export type ActiveDownloadState =
    | 'pending'
    | 'downloading'
    | 'paused'
    | 'failed';

/** 一条活动下载的传输进度；纯运行时态，不持久化（重启后由原生事件重新填充） */
export interface DownloadProgress {
    readonly downloadedBytes: number;
    /** 总字节；未知为 -1（服务端没给 Content-Length） */
    readonly totalBytes: number;
}

/** 活动队列的三个筛选面（「已完成」不在此列：它由已下载库的 `useDownloadedList` 提供） */
export type ActiveDownloadFilter = 'inProgress' | 'queued' | 'failed';

/**
 * `pending` 任务当下处在哪一步；纯运行时态，不持久化，只对 `pending` 有意义
 *
 * registry 只分四态，但「pending」底下混着处境完全不同的任务：有的已经占住并发槽
 * 在解析音源了，有的在等闸门或间隔，有的才是真排队。全都显示成「排队中」，
 * 用户看到并发上限设了 3 却有三条写着排队，只会以为设置没生效
 *
 * - `resolvingSource` 已占并发槽，正在解析音源
 * - `waitingWifi` 「仅 Wi-Fi 下载」闸门拦着
 * - `waitingInterval` 排在队首，正等任务间隔
 * - `queued` 等并发槽位
 */
export type PendingDownloadPhase =
    | 'resolvingSource'
    | 'waitingWifi'
    | 'waitingInterval'
    | 'queued';

/** 摘要与分段筛选的角标计数 */
export interface DownloadSummary {
    /** 真正占着传输槽的（摘要里的「下载中 N」） */
    readonly downloading: number;
    /**
     * 已暂停的
     * 与 `inProgress` 分开给：后者还混着等 Wi-Fi 的排队项，
     * 拿它判「全部继续」会在闸门关着时给出一个点了没反应的动作
     */
    readonly paused: number;
    /** 「进行中」筛选面的条数：下载中 + 已暂停 + 正在解析音源的 + 等 Wi-Fi 的 */
    readonly inProgress: number;
    readonly queued: number;
    readonly failed: number;
}

/**
 * 传输身份：源解析成功、真正交给原生那一刻的快照（四项同生同死，故成组存）
 * **记下而非重算**：contentKey / stagingKey 的算法尚未冻结（将来可能纳入源变体），
 * 而 `.part` 文件名已经落在盘上——算法一变，重算出来的 key 就对不上旧文件，
 * 孤儿清理会把仍可续传的断点当残留删掉，完成回执也对不上任务。
 * `destDir` 同理：它是**这个 `.part` 躺在哪**，不是「现在的下载目录」
 */
export interface TransferIdentity {
    /** 源解析实际命中的音质 */
    readonly resolvedQuality: QualityKey;
    /** 交给原生的字节身份；同时用作 taskId 与完成回执的比对键 */
    readonly contentKey: string;
    /** `.part` 文件名基；孤儿清理据此判存活 */
    readonly stagingKey: string;
    /**
     * 这一趟传输的落盘目录（绝对路径、无尾斜杠）
     *
     * 用户随时可以改下载目录，而这条任务的 `.part` 已经躺在当初那个目录里了：
     * 续传必须回到同一个目录，否则原生会以另一条路径重开、断点白下。故已开始传输的
     * 任务一路用它跑完（文件也落在那儿），换目录只对此后新开的传输生效。
     * 旧记录（本字段之前的版本）读出为空，按当前配置的目录处理——**取这个回落的时刻
     * 有语义**：换目录时必须在写配置之前解释它们，否则那些旧任务会被判成属于新目录，
     * 留在旧目录的断点被当孤儿删掉
     */
    readonly destDir?: string;
}

/**
 * 活动任务记录：registry 的持久化单元（一 mediaKey 一条）；完成后改由已下载库持有、取消即移除
 * 请求音质只在此处：它是**任务参数**（失败重试可恢复原意图），不是文件属性；
 * 任务结束后有意义的是文件实际是哪一档，而非当初要的是哪一档
 */
export type ActiveDownloadRecord = {
    /** 下载那一刻的 MusicItem 深冻结快照（仅展示，遵循插件 DTO 铁律，绝不 mutate 下载态进 item） */
    readonly item: DeepReadonly<MusicItem>;
    /** 业务身份 = utils 的 mediaKey(ref) 返回值（唯一身份编码，勿另造格式）；registry 索引 + 去重，一首歌一条 */
    readonly mediaKey: string;
    readonly state: ActiveDownloadState;
    /** 入队即确定的请求音质，任务存活期间始终保留 */
    readonly requestedQuality: QualityKey;
    /**
     * 入队时间（epoch 毫秒），两个用途：
     * - 调度按它定先后（MMKV 的 key 顺序不保证，不记下来重启后就乱序）
     * - 分辨「还是原来那一条」：取消后重新入队同一首歌会产生新记录，
     *   光看 mediaKey 与状态分不出来，拿旧快照继续处理会把已取消的任务复活
     */
    readonly enqueuedAt: number;
    /**
     * 交给原生时落盘的传输身份；尚未开始传输（pending / 解析前失败）时为空
     * 有值 ⇔ 盘上可能存在对应的 `.part`
     */
    readonly transfer?: TransferIdentity;
    /**
     * 失败原因，仅 `state === 'failed'` 时有意义；重新入队时必须清掉
     * 旧记录（本字段之前的版本）读出为空，界面退回通用的「下载失败」
     */
    readonly failure?: DownloadFailureReason;
};

/**
 * 按传输身份反查所属歌曲的结果
 * 用判别联合而非字符串哨兵，避免把「判不出」误当成 mediaKey；
 * `unknown` = 队列视图不完整（未知 schema / 读取出错），此时「没找到」不等于「不存在」
 */
export type OwnerLookup =
    | { kind: 'found'; mediaKey: string }
    | { kind: 'absent' }
    | { kind: 'unknown' };

/** 下载源解析结果：progressive 直链 + headers + 实际命中音质（B3 源解析产出，B5 拿去 start） */
export interface DownloadSource {
    readonly url: string;
    readonly headers: Record<string, string>;
    readonly resolvedQuality: QualityKey;
}
