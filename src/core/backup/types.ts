import type { IConfig } from '@/core/config';
import type {
    IMediaMetaTransfer,
    MediaMetaRestoreResult,
    MediaMetaTransferItem,
} from '@/core/mediaMeta';
import type {
    ILocalPlaylistTransfer,
    IStarredTransfer,
    LocalPlaylistRestoreResult,
    LocalPlaylistTransferItem,
    StarredPlaylist,
    StarredPlaylistRestoreResult,
} from '@/core/playlist';
import type {
    IPluginManager,
    IPluginTransfer,
    PluginsRestoreResult,
    PluginsTransfer,
} from '@/core/plugin';
import type { WebdavCredentials } from '@/infra/webdav';
import type { DeepReadonly } from '@/types';

/**
 * 可中途取消的耗时操作共用的入参
 * 说的是「这次操作的取消口」，不绑定任何传输实现——远端请求会被真掐掉，
 * 操作以「已取消」结束而非静默悬着
 */
export interface AbortOptions {
    signal?: AbortSignal;
}

/** 备份段名（选择性导出 / 恢复用） */
export type BackupSectionName =
    | 'musicSheets'
    | 'starredPlaylists'
    | 'plugins'
    | 'mediaMeta'
    | 'settings';

/** 平台域设置段：白名单键值对（值在 apply 时按 key 校验） */
export interface BackupSettings {
    values: Record<string, unknown>;
}

/** 各段快照；均可选——缺段表示该段未导出，恢复时按任意模式 no-op */
export interface BackupSections {
    musicSheets?: readonly DeepReadonly<LocalPlaylistTransferItem>[];
    starredPlaylists?: readonly StarredPlaylist[];
    plugins?: PluginsTransfer;
    mediaMeta?: readonly MediaMetaTransferItem[];
    settings?: BackupSettings;
}

/**
 * 恢复模式；仅 musicSheets 与 starredPlaylists 受其影响
 * append 纯加法（现有数据不动）；overwrite 原子替换该域全部内容
 * plugins / mediaMeta / settings 恒增量或恒 upsert，不看此值
 */
export type BackupRestoreMode = 'append' | 'overwrite';

/**
 * 单段恢复结局：段间互不回滚，逐段如实汇报
 * absent = 备份里没这段（缺段恒 no-op）；notSelected = 用户没选它
 * failed 的 errorCode 取端口的稳定错误码（如 STORAGE_DEGRADED），无码时缺省、由 message 兜底
 */
export type RestoreSectionOutcome<TCounts> =
    | { status: 'ok'; counts: TCounts }
    | { status: 'skipped'; reason: 'absent' | 'notSelected' }
    | { status: 'failed'; errorCode?: string; message: string };

/** settings 段恢复计数 */
export interface SettingsRestoreResult {
    /** 实际写入 config 的键数 */
    applied: number;
    /** 因不在白名单、或值不符合该 key 值域（枚举 / 范围 / 格式）而跳过的键数 */
    skipped: number;
}

/** parseBackup 的成功结果；restoreBackup 的输入 */
export type ParsedBackup = Extract<ParseBackupResult, { ok: true }>;

export interface RestoreBackupOptions {
    /** 仅影响 musicSheets 与 starredPlaylists，其余段恒增量 / 恒 upsert */
    mode: BackupRestoreMode;
    /** 段级选择；缺省 = 全部段 */
    selection?: readonly BackupSectionName[];
}

/** 逐段恢复结局汇总；段间互不回滚，某段失败不影响其余段 */
export interface RestoreBackupResult {
    musicSheets: RestoreSectionOutcome<LocalPlaylistRestoreResult>;
    starredPlaylists: RestoreSectionOutcome<StarredPlaylistRestoreResult>;
    plugins: RestoreSectionOutcome<PluginsRestoreResult>;
    mediaMeta: RestoreSectionOutcome<MediaMetaRestoreResult>;
    settings: RestoreSectionOutcome<SettingsRestoreResult>;
    /** 因非「同一安装」被整批忽略的本地媒体引用条数（跨设备恢复提示用） */
    localMediaIgnored: number;
}

/** 产出端信息；installationId 用于同一安装的本地曲恢复门控 */
export interface BackupOrigin {
    platform: 'android' | 'ios' | 'desktop';
    appVersion: string;
    installationId: string;
}

/** 备份文件信封（v2 wire） */
export interface BackupEnvelope {
    format: 'musicfree-backup';
    version: 2;
    createdAt: number;
    origin: BackupOrigin;
    sections: BackupSections;
}

/** 解析出的格式变体：v2 本端 / 桌面 v1 / legacy 手机 / 更新版本 */
export type BackupFormatVariant =
    | 'v2'
    | 'desktopV1'
    | 'legacyMobile'
    | 'future';

/**
 * parseBackup 结果：成功给出 canonical sections（已归一到 v2 形状）+ 格式变体
 * origin / createdAt 尽力保留（legacy / desktop 无 origin；createdAt 缺失时 undefined）
 */
export type ParseBackupResult =
    | {
          ok: true;
          formatVariant: BackupFormatVariant;
          origin?: BackupOrigin;
          createdAt?: number;
          sections: BackupSections;
      }
    | { ok: false; reason: 'corrupt' | 'notBackup' };

/**
 * 从某个来源解析的结果：比 parseBackup 多两种「还没读到内容就已判定失败」的结局
 * tooLarge = 超出协议互通保证区间，不予受理；invalidUrl = 输入压根不是个可用地址
 */
export type ParseBackupSourceResult =
    | ParseBackupResult
    | { ok: false; reason: 'tooLarge'; sizeBytes: number }
    | { ok: false; reason: 'invalidUrl' };

/**
 * 写出的备份文件；落在 app 私有临时位置
 * path 的所有权移交调用方：发布到最终目的地后须自行删除，不会有人代为清理
 */
export interface BackupFile {
    readonly path: string;
    readonly sizeBytes: number;
    /** 超出协议约定的跨端互通保证区间（体积或曲目数），对端可能读不了；不阻断导出，由 UX 提示 */
    readonly exceedsInteropGuarantee: boolean;
}

/** 导出到某个目的地的结果 */
export interface BackupExportResult {
    /** 送达位置：本机为系统 URI，WebDAV 为远端路径 */
    readonly location: string;
    readonly sizeBytes: number;
    /** 超出协议约定的跨端互通保证区间；不阻断导出，由 UX 提示 */
    readonly exceedsInteropGuarantee: boolean;
}

/** 供 UX 使用的备份编排能力（写 = 组装信封；读 = 解析归一） */
export interface IBackup {
    /** 收集选中段的快照 → 组装信封；不落盘（传输走后续）。某选中段快照失败即抛出 */
    createBackup(
        selection?: readonly BackupSectionName[],
    ): Promise<BackupEnvelope>;
    /**
     * 组装信封 → 流式写出到 app 私有临时文件，返回其路径与字节数
     * 全程不持有完整 JSON 文本；失败时尽力清理半成品后抛出，不留下看似成功的残缺文件
     */
    createBackupFile(
        selection?: readonly BackupSectionName[],
    ): Promise<BackupFile>;
    /**
     * 写出备份并交付到系统「下载」目录，成败都清理临时文件
     * 文件名按协议建议带出时间，同名由系统改名而非覆盖
     */
    exportBackupToDownloads(
        selection?: readonly BackupSectionName[],
    ): Promise<BackupExportResult>;
    /**
     * 写出备份并上传到 WebDAV 的协议固定路径；凭据取自 config，未配置则抛出
     * 直接 PUT 覆盖固定文件；上传失败或中断时旧内容是否保留取决于服务端
     * 大备份在慢网上可能要传几十分钟，故给 `options.signal` 留了取消口
     */
    exportBackupToWebdav(
        selection?: readonly BackupSectionName[],
        options?: AbortOptions,
    ): Promise<BackupExportResult>;
    /**
     * 从 WebDAV 的协议固定路径读取并解析
     * 服务端报大小时先查再读，正文读取后始终校验实际 UTF-8 字节数
     * 传输仍会缓冲完整正文，读后校验不能限制接收期间的内存峰值
     */
    parseBackupFromWebdav(
        options?: AbortOptions,
    ): Promise<ParseBackupSourceResult>;
    /**
     * 从 http(s) 地址增量接收文本并校验字节数；非 http(s) 输入返回 invalidUrl
     * 取消和超时会中止请求；接收完成后仍需对全文进行 JSON 解析
     */
    parseBackupFromUrl(
        url: string,
        options?: AbortOptions,
    ): Promise<ParseBackupSourceResult>;
    /**
     * 探测一组凭据能否连上；失败时抛出原始错误供 UX 展示
     * 取候选凭据而非已存配置：让用户能先试再存，试一下不应该等同于存下来
     * `options.signal` 供 UX 中途取消——探测本身有超时兜底，但用户不该被迫等它走完
     */
    testWebdavConnection(
        credentials: WebdavCredentials,
        options?: AbortOptions,
    ): Promise<void>;
    /** 解析备份文本：版本探测 + 结构校验 + 归一 canonical；不 apply（恢复属后续） */
    parseBackup(text: string): ParseBackupResult;
    /**
     * 读取并解析备份文件；先查大小再读入，超限直接拒绝而不试图 parse
     * 接受 file:// URI 或裸路径
     */
    parseBackupFile(filePathOrUri: string): Promise<ParseBackupSourceResult>;
    /**
     * 把已解析的 canonical sections apply 到各端口；逐段隔离错误、如实汇报
     * 缺段与未选中段恒 no-op；本地曲仅在「同一安装」时恢复（否则整批忽略并计数）
     */
    restoreBackup(
        parsed: ParsedBackup,
        options: RestoreBackupOptions,
    ): Promise<RestoreBackupResult>;
}

/** Backup 构造注入依赖（跨模块端口 + config；infra 直接 import） */
export interface BackupDeps {
    playlist: ILocalPlaylistTransfer & IStarredTransfer;
    /** 插件段快照 + mediaMeta 平台集合（getOrder 给已装插件）；就绪屏障也走 snapshotPlugins */
    pluginManager: IPluginTransfer & Pick<IPluginManager, 'getOrder'>;
    mediaMeta: IMediaMetaTransfer;
    config: IConfig;
}
