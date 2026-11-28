/**
 * 下载模块的门面契约：UX 与其他 core 看到的那一面
 *
 * 模块内部分两侧，各自的类型在各自的 `types.ts`：
 * - `transfer/` —— 入队到落盘之间的传输态，完成即消散
 * - `downloaded/` —— 下载过的歌与文件产物，长期保留
 *
 * 本文件只放**跨越两侧**的东西：`DownloadRecord` 把「在途」与「已完成」合成用户眼里的
 * 同一个下载态，`IDownload` 是两侧对外的统一入口
 */
import type { DownloadedEntry } from './downloaded/types';
import type {
    ActiveDownloadRecord,
    ActiveDownloadState,
} from './transfer/types';
import type { IConfig } from '@/core/config';
import type { ILocalMusic } from '@/core/localMusic';
import type { IMediaMeta } from '@/core/mediaMeta';
import type { IPluginManager } from '@/core/plugin';
import type { DeepReadonly, MediaRef, MusicItem, QualityKey } from '@/types';

/**
 * 下载记录状态机五态（命名带 Record 以别于原生 downloadEngine 的活动传输态 DownloadState）：
 * 传输侧的四个活动态，加上一个 `done`——完成后记录改由已下载库持有，不再留在 registry
 */
export type DownloadRecordState = ActiveDownloadState | 'done';

/** `done` 态的完成产物：路径 + 容器 + 大小 + 完成时间 + 实际音质，原子出现、不可拆分 */
interface DownloadArtifact {
    /** 最终文件绝对路径 */
    readonly path: string;
    /** 容器扩展名（小写无点，如 mp3 / flac） */
    readonly extension: string;
    /** 文件字节数 */
    readonly sizeBytes: number;
    /** 完成时间戳（epoch 毫秒） */
    readonly completedAt: number;
    /** 这份文件实际是哪一档（源解析命中的音质） */
    readonly resolvedQuality: QualityKey;
}

/**
 * 一条下载记录（按 state 判别联合）：活动态来自 registry，`done` 来自已下载库
 * 两侧各自拥有自己的记录形状，本类型只负责组合；
 * item 为 MusicItem 深冻结快照，下载态与之并列、绝不 mutate 进 item
 */
export type DownloadRecord =
    | ActiveDownloadRecord
    | (Pick<DownloadedEntry, 'item' | 'mediaKey'> & {
          readonly state: 'done';
      } & DownloadArtifact);

/** 构造依赖 */
export interface DownloadDeps {
    /** 并发上限 / 任务间隔 / 默认下载音质 / 音质回退方向 */
    readonly config: IConfig;
    /** 源解析：按音质回退链调 getMediaSource 拿新鲜直链 */
    readonly pluginManager: IPluginManager;
    /** 下载完成后把文件并入本地库（否则要等到下次扫描才可见）；删文件也统一走它 */
    readonly localMusic: ILocalMusic;
    /** 离线播放锚点：完成时写入、删文件时按 path 清除 */
    readonly mediaMeta: IMediaMeta;
}

/**
 * 改下载目录的结果码（UI 据此选文案）；除 `ok` 外一律没有改动任何配置
 * 用码而非抛错：这些都是用户能理解、能自己处理的情形，不是异常
 */
export type SetDownloadDirResult =
    | 'ok'
    /** 已经有一趟修改在跑（重入） */
    | 'changing'
    /** 不是绝对路径 */
    | 'invalid'
    /** 目录建不出来或写不进去（没授权 / 只读介质 / 卷已拔出） */
    | 'notWritable'
    /** 平台没有下载引擎（当前 iOS） */
    | 'unsupported'
    /**
     * 在途任务的落盘位置没能记下来（MMKV 写失败），故没敢切
     * 记不下就等于此后再不知道它们的 `.part` 在哪：续传会走错目录、清理会误删
     */
    | 'pinFailed'
    /**
     * 新目录里的残留 `.part` 没能清干净（列不出来 / 删除被拒 / 队列视图不完整以致
     * 算不出该放过谁），故没敢切过去
     * 这一趟清理承担正确性：残留会被「按已有长度无条件续传」接管，发布出损坏文件
     */
    | 'staleFiles';

/** 下载端口：UX / 其他 core 经此单门读写（DI 注入 IDownload） */
export interface IDownload {
    /**
     * 启动（幂等）：初始化原生引擎 + 接管已在跑的任务 + 补录未入账的完成 + 清残留 `.part`
     * 不支持下载的平台（当前 iOS）直接返回；失败不抛，不拖垮启动
     */
    setup(): Promise<void>;
    /**
     * 入队下载（一律用设置里的默认下载音质）；返回实际入队数
     *
     * 两种跳过，都不需要猜调用方意图：
     * - 已在队列里（重复点不叠加）
     * - 已有**不低于默认档**的文件——只升不降（设计 §5.1），绝不自动把更高音质换掉
     *
     * 音质不作为参数：它是全局设置，不是每首歌的属性（设计 §5.2）。
     * 想换音质走「删除文件 → 改设置 → 重新下载」
     */
    enqueue(items: readonly DeepReadonly<MusicItem>[]): number;

    /*
     * —— 落盘目录 ——
     * 默认是 app 私有目录（免权限、卸载即删）；用户可改到任意目录，
     * 那需要全文件访问 / 存储写权限，UI 侧先把权限门过掉再进目录浏览器
     */

    /** 当前落盘目录（绝对路径）：设置页显示、也是「文件到底去哪了」的唯一答案 */
    getDownloadDir(): string;
    /** 是否仍在用 app 私有默认目录（UI 据此决定给不给「恢复默认」） */
    isUsingDefaultDownloadDir(): boolean;
    /**
     * 改落盘目录：校验形态 → 建目录并试写 → **清新目录**的孤儿 `.part` → 落配置 →
     * **清旧目录**的孤儿 `.part`
     *
     * 两趟清理分居配置写入两侧是刻意的：每一趟都要作用在「此刻不可能有人往里写」的
     * 目录上。切之前新目录还没人用，切之后旧目录再没人用；反过来就是在清活目录，
     * 清理期间入队的任务正好会接管那个陈旧 `.part`（详见实现注释）
     *
     * **已下载的旧文件留在原处不搬**：记录里存的是绝对路径，照旧能播能删；
     * 搬家要动用户的文件、还可能中途失败，不是一次设置变更该承担的事
     *
     * 同一时刻只允许一次修改（重入直接 `changing`）：两次修改重叠会让「新目录此刻没人写」
     * 这个前提失效——前一次已经把配置切到 B，后一次还在清 B
     *
     * **队列非空也能改**：落盘目录钉在任务的传输身份上（`TransferIdentity.destDir`），
     * 已交给原生的任务继续在原目录跑完，换目录只对此后新开的传输生效
     */
    setDownloadDir(path: string): Promise<SetDownloadDirResult>;
    /** 恢复默认目录；与 setDownloadDir 同样不要求队列为空 */
    resetDownloadDir(): Promise<SetDownloadDirResult>;
    /** 按 MediaRef 查下载记录（未下载则 undefined）；供播放详情页等按 platform+id O(1) 判下载态 */
    getRecord(ref: MediaRef): DownloadRecord | undefined;

    /*
     * 以下用户命令有一条共同规则：**已交给原生的任务只发指令，状态改由原生的事件驱动**
     * 抢先改状态会造出「JS 以为停了、原生还在传」的分叉。只有尚未交给原生的排队任务
     * 没有原生对应物，才可以就地改
     */

    /** 暂停：保留已下字节，之后可从断点续传 */
    pause(ref: MediaRef): void;
    /** 继续下载：重新排队（已下的字节由原生续传复用） */
    resume(ref: MediaRef): void;
    /** 重试失败的任务：同样是重新排队，只接受失败态 */
    retry(ref: MediaRef): void;
    /** 取消并离队：删除断点文件，已发布的成品文件不动 */
    cancel(ref: MediaRef): void;
    /** 暂停全部未完成任务（含排队中的，否则它们会立刻填上空出的槽） */
    pauseAll(): void;
    /** 继续全部已暂停任务 */
    resumeAll(): void;
    /** 取消全部任务 */
    cancelAll(): void;

    /*
     * —— 已下载库 ——
     * 完成即毕业出活动队列，改由这里长期持有；它既是下载页「已完成」的数据源，
     * 也是「这首歌下过没」的判据
     * 入账不开在端口上：那是完成流程的内部事
     */

    /** 按 MediaRef 查已下载条目（未下载则 undefined）；O(1) 单键读 */
    getDownloaded(ref: MediaRef): DownloadedEntry | undefined;
    /** 移除下载记录：只从下载库删掉这一条，**不动磁盘文件、不动本地库、不动播放锚点**；返回是否确实删掉 */
    forgetDownload(ref: MediaRef): boolean;

    /*
     * 没有「删除已下载文件」：磁盘上的文件归 `localMusic`，UI 一律走它的 `deleteFiles`。
     * 本模块订阅它的「文件已删除」广播，自行摘掉对应记录（设计 §6）——
     * 否则跨模块一致性会被摊派给每一个 UI 删除入口，漏一个就是悬空记录
     */
}
