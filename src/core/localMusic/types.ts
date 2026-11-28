import type { IMediaMeta } from '@/core/mediaMeta';
import type { Locale } from '@/i18n';
import type { StorageAccessStatus } from '@/infra/permission';
import type { DeepReadonly, MediaRef, MusicItem } from '@/types';

/**
 * 本地音乐库持久化 wire 契约冻结（改动导致用户缓存不兼容）
 * store=`music.LocalMusic`：library（扫描缓存 + 每文件指纹/addedAt/封面）+ scanSettings + sort
 * 本地库是扫描的全量快照 + 增量、非用户手动歌单，故独立存储、不并入 core/playlist
 */
export const LOCAL_MUSIC_STORE_ID = 'music.LocalMusic';
/** 扫描缓存（值=LocalLibrary） */
export const LOCAL_LIBRARY_KEY = 'library';
export const LOCAL_SCAN_SETTINGS_KEY = 'scanSettings';
export const LOCAL_SORT_KEY = 'sort';

/** library 结构版本（变更时 +1 并迁移/重扫） */
export const LOCAL_LIBRARY_SCHEMA_VERSION = 1;

/** 每个本地文件的旁路元数据（增量指纹 + 首次发现时间 + 封面 + 派生集合所需字段） */
export interface LocalFileMeta {
    /** 增量指纹之一：修改时间毫秒 */
    mtimeMs: number;
    /** 增量指纹之二：字节数（覆盖文件保留 mtime 时靠它识变化） */
    sizeBytes: number;
    /** 首次发现时间（epoch 毫秒、稳定）——供 addedAt 排序 */
    addedAt: number;
    /** 已提取的封面本地路径（懒取后缓存；无封面则缺省） */
    coverPath?: string;
    /** 原生 TagLib 报告是否有内嵌封面（懒取封面的判据；false 则不必尝试提取） */
    hasCoverArt: boolean;
    /** 专辑艺术家（MusicItem 无此字段）——派生「专辑」集合的复合 key */
    albumArtist: string;
    /** 所属目录 canonical 路径——派生「文件夹」集合 */
    folderPath: string;
    /**
     * 读这条时所用的旧标签修复码表（见 lib/legacyTagCharset）；缺失＝升级前入的库
     *
     * 与当前码表不同就让这一条的指纹失效、强制重读：指纹只看 mtime:size，文件没变
     * 就跳过读 tag，于是升级前已入库的乱码永远不会被修，用户切语言后也不会按新码表重读。
     *
     * **记在每文件而不是整库**：一轮扫描里读失败的文件、以及未挂载卷下没被枚举到的
     * 文件都不会被重读，若记在库上就会把它们一并标成「已按新码表读过」而永久跳过。
     * 记在文件上，这些条目自然保持失效、下次扫描继续重试
     */
    tagCharset?: string;
}

/** 从系统文件位置解析出的歌曲身份与 canonical 物理路径 */
export interface ResolvedLocalMusicFile {
    /** 可进入队列 / 收藏 / 历史的歌曲身份快照 */
    readonly item: MusicItem;
    /** 本次播放应优先使用的 canonical 裸路径 */
    readonly path: string;
}

/** 扫描缓存：曲目快照 + 每文件旁路元数据（均按 path 索引，派生/增删 O(1)）；启动秒出 + 增量比对 */
export interface LocalLibrary {
    version: number;
    /** path → 该文件对应的歌（身份跟随来源：带自描述声明的用声明里的插件身份，否则 platform='本地'）；顺序无关、排序由 sort 派生 */
    musicByPath: Record<string, MusicItem>;
    /** path → 旁路元数据 */
    files: Record<string, LocalFileMeta>;
}

/** 库浏览视图（顶部 Tab）：all=曲目列表；其余=集合概览 */
export type LocalMusicView = 'all' | 'folders' | 'albums' | 'artists';
/** 集合概览视图（不含 all——all 是曲目列表不是集合） */
export type LocalCollectionView = 'folders' | 'albums' | 'artists';

/** 曲目排序字段（全局一份，作用于曲目列表：all 视图 + 各集合详情） */
export type LocalSortBy = 'title' | 'artist' | 'addedAt' | 'duration';
/** 排序字段全集（运行时校验用） */
export const SORT_BYS: readonly LocalSortBy[] = [
    'title',
    'artist',
    'addedAt',
    'duration',
];
export interface LocalSort {
    readonly by: LocalSortBy;
    /** 降序 */
    readonly desc: boolean;
}

/** 默认排序：标题升序 */
export const DEFAULT_SORT: LocalSort = { by: 'title', desc: false };

/**
 * 集合概览项（从 library 内存派生、不落库）——按视图判别联合，各暴露领域字段
 * 概览本身按 name 升序；LocalSort 只作用曲目列表、不作用此概览
 * coverRef=代表封面曲的 ref（首个有内嵌封面成员）；概览惰性 resolveCover 出封面、缺则图标占位
 */
export type LocalCollection =
    | {
          kind: 'folder';
          /** 目录 canonical 路径（稳定 key） */
          path: string;
          /** 展示名（目录末段） */
          name: string;
          count: number;
          coverRef?: Readonly<MediaRef>;
      }
    | {
          kind: 'album';
          /** 复合稳定 key=JSON([album, albumArtist])（避免同名专辑跨艺术家合并、标签含 NUL 也无碰撞） */
          key: string;
          album: string;
          albumArtist: string;
          count: number;
          coverRef?: Readonly<MediaRef>;
      }
    | {
          kind: 'artist';
          /** 艺术家名（稳定 key） */
          artist: string;
          /** 该艺术家的专辑数 */
          albumCount: number;
          count: number;
          coverRef?: Readonly<MediaRef>;
      };

/** 视图 → 该视图的集合项类型；让 useLocalCollections(view) 精确返回、免 UI 层按 view 断言 kind */
export interface LocalCollectionByView {
    folders: Extract<LocalCollection, { kind: 'folder' }>;
    albums: Extract<LocalCollection, { kind: 'album' }>;
    artists: Extract<LocalCollection, { kind: 'artist' }>;
}

/** 扫描范围 + 过滤（持久化到 LOCAL_SCAN_SETTINGS_KEY） */
export interface ScanSettings {
    /** 全盘 / 指定目录 */
    readonly mode: 'all' | 'custom';
    /** 指定目录（mode='custom' 用） */
    readonly includedDirs: readonly string[];
    /** 排除目录（两种模式都生效） */
    readonly excludedDirs: readonly string[];
    /**
     * 下载的歌算不算本地音乐（默认算）
     *
     * 开着 = 下载完成即写进库，**且扫描把当前下载目录一并当扫描根**——不看它的话，
     * 写进去的曲目会在下一次扫描的差量结算里被判成「已消失」而清掉（设计 §9）
     * 关掉 = 不写入，且**不做任何反向动作**：那个目录该不该扫由扫描范围自己说
     * （旧版关掉会强行排除下载目录，而它现在可能是用户的普通音乐文件夹）
     * 用户明确排除的目录压过本开关。wire key 沿用 `includeDownloadDir`（持久化冻结）
     */
    readonly includeDownloadDir: boolean;
    /** 「过滤小于 N 秒」；0=不过滤 */
    readonly minDurationSec: number;
    /** 最小文件大小字节；0=不限 */
    readonly minSizeBytes: number;
}

/** 扫描状态机（UI 据此渲染 idle/进度/完成/取消/失败） */
export type ScanStatus =
    | 'idle'
    | 'enumerating'
    | 'scanning'
    | 'completed'
    | 'cancelled'
    | 'failed';

/** 扫描进度（reactive） */
export interface ScanProgress {
    readonly status: ScanStatus;
    /** 已并入库的曲目数（含复用旧缓存） */
    readonly found: number;
    /** 已处理候选数（含成功/兜底/失败，与原生一致） */
    readonly processed: number;
    /** 待处理总数（enumerating 后确定） */
    readonly total: number;
    /** 当前扫描位置短文本 */
    readonly currentPath: string;
    /** status='failed' 时的错误码 */
    readonly errorCode?: string;
}

/** 删除失败原因码（可分支 + i18n；原始 message 只进日志） */
export type LocalDeleteFailCode = 'permission' | 'notFound' | 'io' | 'unknown';

/** 删除结果反馈 */
export interface LocalDeleteReport {
    /** 物理删成功数 */
    deleted: number;
    /** 失败数 */
    failed: number;
    /** 失败项（稳定码 + 路径；路径未能解析时缺省） */
    failures: { code: LocalDeleteFailCode; path?: string }[];
}

/** 构造依赖：扫描路径写入 mediaMeta，供 player 经 getLocalFiles 读取本地文件候选 */
export interface LocalMusicDeps {
    mediaMeta: IMediaMeta;
    /**
     * 当前应用语言（现问现取，用户随时可改）
     *
     * 扫描用它选「旧标签乱码」的修复码表（见 lib/legacyTagCharset）——哪张码表
     * 无法从字节判断，只能按语言定。注入而非直接 import i18n：真相源在 i18n/store，
     * 同 getDownloadTarget 的道理
     */
    getLocale: () => Locale;
    /**
     * 当前下载落盘位置（现问现取，用户随时可改）；注入取值函数而非常量：真相源在 core/download
     *
     * 扫描要它做两件事：
     * - 开关开着时把 `dir` 一并当扫描根——否则 `addFile` 刚写进库的歌会在下一次扫描的
     *   差量结算里被判成「已消失」而清掉（库里有、扫描却没看它，两边来回打架）
     * - 开关关掉且 `isAppPrivate` 时把 `dir` 并进「完成时清库」的目录——app 私有目录是
     *   我们自己的，里面不可能有用户的音乐文件夹，故清它是安全的；而它在 `Android/data`
     *   之下、系统不让枚举，指望原生的差量结算永远清不掉那些条目
     */
    getDownloadTarget: () => {
        /** 绝对路径 */
        dir: string;
        /** 是否 app 私有默认目录 */
        isAppPrivate: boolean;
    };
}

/**
 * 本地音乐库端口：扫描设备音频 → 组装 MusicItem → 维护 library + 多视图 + 增删
 * 扫描在原生 TagLib 批量做（native/mediaScanner 引擎桥，core/localMusic 属主），core 订阅事件、
 * 按 scanId 丢弃迟到事件、增量合并、落 MMKV、发 atom → UI
 * 性能：原生后台线程 + 分批事件（摊开物化）+ 指纹增量（只重读变化）+ 启动读缓存 + 封面懒取 + 多视图内存派生
 * 转换（ScannedAudioFile→MusicItem）在此层：url=URI 编码的 file://path、duration=durationMs/1000；
 * 身份取自文件自带的声明（有则用它），否则 platform='本地'。本模块不认识「下载」，
 * 只知道「有些文件自带身份声明」——声明是谁写的与它无关
 */
export interface ILocalMusic {
    /** 查权限（R+ 全文件访问 / ≤10 读权限）；R+ 未授予恒 denied（引导去设置） */
    checkPermission(): Promise<StorageAccessStatus>;
    /** 请求权限并返回结果：R+ 跳系统设置页（靠回前台复检收敛）/ ≤10 运行时弹窗 */
    requestPermission(): Promise<StorageAccessStatus>;
    /** 打开系统设置页：≤10 权限被永久拒绝（blocked）后的授予入口 */
    openPermissionSettings(): Promise<void>;
    /** 请求写权限（删原文件用）：R+ 复用全文件访问 / ≤10 请求 WRITE（同 READ 组、通常静默 granted） */
    requestFileWriteAccess(): Promise<StorageAccessStatus>;

    /** 按当前 ScanSettings 启动扫描（分配 scanId、订阅进度、分批增量合并、落库、发 atom） */
    startScan(): void;
    /** 取消当前扫描（保留已合并结果、不做完成删除结算） */
    cancelScan(): void;

    /** 改扫描范围/过滤（持久化；改后由 UI 触发 startScan 重扫） */
    setScanSettings(patch: Partial<ScanSettings>): void;
    /** 设全局曲目排序（持久化；作用所有曲目列表） */
    setSort(sort: LocalSort): void;

    /** 从库移除：只从当前快照删（下次扫描扫回）、不碰物理文件；保留 mediaMeta 锚点供 deleteFiles 回退取路径 */
    removeFromLibrary(refs: readonly MediaRef[]): void;
    /** 清空扫描缓存库（回待扫描态）：库归 null、进度 idle、删持久化快照；保留 scanSettings/sort、不碰物理文件 */
    clearLibrary(): void;
    /** 删原文件（core 按 ref 查权威 path、rn-fs unlink）+ 同步从库移除；失败项如实回报 */
    deleteFiles(refs: readonly MediaRef[]): Promise<LocalDeleteReport>;
    /**
     * 按路径删原文件（unlink 复核 + 清指向它的播放锚点 + 从库移除）
     * 删文件的机制只此一处；手上已有路径的调用方（如删已下载文件）直接用它，不必先反查 ref
     */
    deleteFilesAt(paths: readonly string[]): Promise<LocalDeleteReport>;
    /**
     * 订阅「文件已删除」；返回退订函数。回调拿到的是**实际删成功**的路径
     *
     * 删文件要同步清掉其它模块持有的记录（如下载记录），但本模块不得知道它们存在。
     * 广播让依赖保持单向，也把跨模块一致性收到一处——否则它会被摊派给每一个 UI
     * 删除入口，漏一个就是悬空记录（设计 §6）
     *
     * 事件是「文件已删除」而非「库变了」：「从本地库移除」与「清空音乐库」都不删文件
     *
     * **同步分发**：回调跑到时库里已经没有那几条了。只做同步记账；要做异步收尾就自己安排、
     * 自己吞掉拒绝——广播方不会 await 订阅者（否则一个慢订阅者会把删除结果一起拖住）
     */
    subscribeFilesDeleted(cb: (paths: readonly string[]) => void): () => void;

    /**
     * 把一个**已知存在的文件**直接写进库（不等下次扫描）
     * 身份以传入 item 为准（与它写进文件的身份声明一致），url 换为本地 file://，
     * 使它与「下次扫描读回声明重建出来的那条」逐字段一致，写入与扫描幂等
     * **尽力而为、不抛错**：调用方（如下载入账）不应因入库失败而回滚自己已完成的事实
     *
     * 两道门（都不报错、静默跳过）：`includeDownloadDir` 关掉时整个不写；
     * 路径落在用户明确排除的目录里也不写（设计 §9）。目前唯一调用方是下载入账，
     * 故这两道门与方法语义一致；将来若出现别的来源（如「把这个文件导入我的音乐库」），
     * 得先把门的含义重新表达清楚，别让新调用方静默无效
     */
    addFile(input: {
        item: DeepReadonly<MusicItem>;
        path: string;
        sizeBytes: number;
        addedAt: number;
    }): void;

    /**
     * 把系统交来的文件位置（content:// / file:// / 裸路径）解析成歌曲身份 + 物理路径
     * 非本地音频、或定位不到真实路径（云盘等无对应文件的 provider）一律 null
     * 只解析不入库：成员资格由扫描范围决定，外部打开一次不代表这首歌属于本地库
     */
    resolveMusicFile(
        fileLocation: string,
    ): Promise<ResolvedLocalMusicFile | null>;

    /** 当前库曲目快照（按全局排序，只读）；React 侧用 useLocalMusicList */
    getMusicList(): readonly MusicItem[];
    /** 某视图的集合概览（内存派生、名称升序）；React 侧用 useLocalCollections */
    getCollections(view: LocalCollectionView): readonly LocalCollection[];
    /** 某集合的曲目（内存派生、按全局排序）；React 侧用 useCollectionMusic */
    getCollectionMusic(
        view: LocalCollectionView,
        key: string,
    ): readonly MusicItem[];
    /** 惰性解析某本地曲封面 → 可显示 uri（无内嵌封面 / 失败 → null）；React 侧用于列表行 / 概览封面懒取 */
    resolveCover(ref: MediaRef): Promise<string | null>;
    /** 某集合的代表封面曲 ref（详情头惰性 resolveCover 用；无则 undefined） */
    getCollectionCoverRef(
        view: LocalCollectionView,
        key: string,
    ): Readonly<MediaRef> | undefined;
    /** 当前扫描进度快照；React 侧用 useScanProgress */
    getScanProgress(): ScanProgress;
    getScanSettings(): ScanSettings;
    getSort(): LocalSort;
    /** 命令式读取全部曲目快照（按全局排序）；供非 React 场景（如多选批量页来源）取列表，语义与 useLocalMusicList 一致 */
    getMusicList(): readonly MusicItem[];
}
