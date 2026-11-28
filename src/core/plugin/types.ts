import type { IConfig } from '@/core/config';
import type {
    AlbumInfoResult,
    AlbumItemBase,
    ArtistItem,
    ArtistMediaType,
    Comment,
    MediaBase,
    MediaSource,
    MediaType,
    MusicItem,
    PaginationResponse,
    PlaylistGroup,
    PlaylistInfoResult,
    PlaylistItemBase,
    PluginDefinition,
    QualityKey,
    RawLyric,
    RecommendPlaylistTagsResult,
    RecommendTag,
    SearchResult,
    TopListInfoResult,
    UserVariable,
} from '@/types';

/**
 * 注册表条目（元数据缓存，存 MMKV）
 * UI 列表 / 能力过滤 / 版本检查全从此读，零编译零源码 IO
 */
export interface PluginMetaRecord {
    /** 实际源码文件名（新装 = <hash>.js；legacy 迁移暂用原名，清理段可规范化） */
    file: string;
    /** SHA256(源码)：去重 / 更新 / 校验 */
    hash: string;
    version?: string;
    author?: string;
    description?: string;
    /** 更新来源 URL */
    srcUrl?: string;
    /** 插件要求的 app 版本（启动免编译判版本） */
    appVersion?: string;
    /** 实现了哪些方法（规范名，deprecated 旧名经 fallback 表归一；免编译过滤能力） */
    supportedMethods: string[];
    /** 插件默认搜索类型（原样存，可含 legacy 'sheet'；出站 wire 兼容用，归一化留调用边界） */
    defaultSearchType?: string;
    /** 插件支持的搜索类型（原样存，可含 'sheet'；归一化留调用边界） */
    supportedSearchTypes?: string[];
    /** 变量 schema（UI 变量编辑器免编译即可显示） */
    userVariables?: UserVariable[];
}

/**
 * 插件运行态
 * pending: 注册表已知、源码未编译（正常启动后的常态）
 * ready:   已懒编译成功
 * error:   versionMismatch（启动从缓存 appVersion 判，免编译）| parseError（编译时才知）
 */
export type PluginState = 'pending' | 'ready' | 'error';

export type PluginErrorReason = 'versionMismatch' | 'parseError';

/**
 * 方法调用归口（纯输出规范化）
 * 每方法 = ensureLoaded() → 调 definition（无则回退 deprecated 旧名）→ normalizeArgs → 调用 → normalizeResult / defaultResult
 * 只做 platform 盖章 / 默认值 / sheet 出站 / 结果整形；缓存 / mediaMeta / 重试 / 本地歌词包在归口外（core/player·lyric·mediaMeta）
 */
export interface PluginMethods {
    search<T extends MediaType>(
        query: string,
        page: number,
        type: T,
    ): Promise<SearchResult<T>>;
    getMediaSource(
        item: MusicItem,
        quality: QualityKey,
    ): Promise<MediaSource | null>;
    getMusicInfo(item: MusicItem): Promise<Partial<MusicItem> | null>;
    getLyric(item: MusicItem): Promise<RawLyric | null>;
    getAlbumInfo(
        item: AlbumItemBase,
        page: number,
    ): Promise<AlbumInfoResult | null>;
    getArtistWorks<T extends ArtistMediaType>(
        item: ArtistItem,
        page: number,
        type: T,
    ): Promise<SearchResult<T>>;
    getPlaylistInfo(
        item: PlaylistItemBase,
        page: number,
    ): Promise<PlaylistInfoResult | null>;
    getTopLists(): Promise<PlaylistGroup[]>;
    getTopListDetail(
        item: PlaylistItemBase,
        page: number,
    ): Promise<TopListInfoResult>;
    getRecommendPlaylistTags(): Promise<RecommendPlaylistTagsResult>;
    getRecommendPlaylistsByTag(
        tag: RecommendTag,
        page?: number,
    ): Promise<PaginationResponse<PlaylistItemBase>>;
    getMusicComments(
        item: MusicItem,
        page?: number,
    ): Promise<PaginationResponse<Comment>>;
    importMusicItem(urlLike: string): Promise<MusicItem | null>;
    importPlaylist(urlLike: string): Promise<MusicItem[] | null>;
}

/** 插件方法名（源资格/能力查询按方法集表达） */
export type PluginMethodName = keyof PluginMethods;

/**
 * 插件实体：pending 即可读缓存元数据，方法调用时自动懒编译
 */
export interface Plugin {
    /** 用户身份（注册表 key / MediaItem.platform） */
    readonly platform: string;
    /** 内容身份（文件 <hash>.js / 去重 / 更新删旧） */
    readonly hash: string;
    readonly version?: string;
    readonly author?: string;
    readonly description?: string;
    readonly srcUrl?: string;
    readonly userVariables?: UserVariable[];
    readonly supportedMethods: ReadonlySet<keyof PluginMethods>;
    /**
     * 插件声明的可搜索类型（'sheet'→'playlist' 归一）；undefined = 未声明，视为支持全部类型（对齐 legacy wire 契约）
     * 元数据派生、pending 即可读；是否真的可搜索另看 supportedMethods 含 'search'
     */
    readonly supportedSearchTypes?: readonly MediaType[];
    readonly state: PluginState;
    readonly errorReason?: PluginErrorReason;
    /** 懒编译后才有 */
    readonly definition?: PluginDefinition;
    /** 调用时自动 load() + 兜底 */
    readonly methods: PluginMethods;
    /** 幂等记忆化编译 */
    load(): Promise<void>;
}

/** 安装结果 */
export type InstallResult =
    | {
          ok: true;
          platform: string;
          alreadyInstalled?: boolean;
          /** 提交时跳过、既非更新也非失败：更新目标已被卸载（不复活），或恢复恒增量下 platform 已被占用（不替换） */
          skipped?: boolean;
      }
    | {
          ok: false;
          reason: 'network';
          /** 请求失败的线索（状态码 / 超时），让用户能自查地址；拿不到就不带 */
          detail?: NetworkFailureDetail;
      }
    | {
          ok: false;
          reason:
              | 'olderVersion'
              | 'versionMismatch'
              | 'parseError'
              | 'invalid'
              /** 地址返回的是网页而不是源码（贴了 GitHub 网页链接、CDN / 运营商错误页） */
              | 'notPluginSource';
      };

/** 网络请求失败时能给用户看的线索：有响应就是状态码，没响应只可能确认超时 */
export type NetworkFailureDetail =
    | { kind: 'status'; status: number }
    | { kind: 'timeout' };

/** 订阅源 */
export interface SubscribeSource {
    name: string;
    url: string;
}

/** 管理器端口 */
export interface IPluginManager {
    /** 启动：读注册表（快）/ 升级首次迁移（一次性）；bootstrap await，不阻塞首屏渲染 */
    setup(): Promise<void>;

    installFromFile(path: string): Promise<InstallResult[]>;
    installFromUrl(url: string): Promise<InstallResult[]>;
    uninstall(platform: string): Promise<void>;
    uninstallMany(platforms: string[]): Promise<void>;
    update(platform: string): Promise<InstallResult>;
    updateAll(): Promise<InstallResult[]>;
    updateMany(platforms: string[]): Promise<InstallResult[]>;
    /**
     * 启动时的静默自动更新：开关开且距上次满 24h 才跑，只更已启用且有源地址的插件
     * 结果与失败都不外露（承诺永不抛），调用方 fire-and-forget
     */
    autoUpdate(): Promise<void>;

    getAll(): Plugin[];
    getByPlatform(platform: string): Plugin | undefined;
    /** 按 item.platform 解析 */
    getByMediaItem(item: MediaBase): Plugin | undefined;
    /**
     * 支持搜索的已启用插件（按用户 order 升序）；传 type 再筛支持该搜索类型的
     * 命令式读取；React 侧用 useSearchablePlugins（响应插件增删 / 排序 / 启停）
     */
    getSearchablePlugins(type?: MediaType): Plugin[];

    isEnabled(platform: string): boolean;
    setEnabled(platform: string, enabled: boolean): void;
    /** platform 数组 */
    getOrder(): string[];
    setOrder(platforms: string[]): void;

    getUserVariables(platform: string): Record<string, string>;
    setUserVariables(platform: string, vars: Record<string, string>): void;
    getAlternative(platform: string): string | null;
    setAlternative(platform: string, altPlatform: string | null): void;

    getSubscriptions(): SubscribeSource[];
    setSubscriptions(sources: SubscribeSource[]): void;
    updateFromSubscriptions(): Promise<InstallResult[]>;
}

/** installed 插件传输项：只记来源与启停；不含源码 / 用户变量（凭据） */
export interface InstalledPluginTransfer {
    readonly srcUrl: string;
    readonly version?: string;
    readonly enabled: boolean;
}

/** 音源重定向传输项：把 platform 的音源指向 alternativePlatform */
export interface PluginAlternativeTransfer {
    readonly platform: string;
    readonly alternativePlatform: string;
}

/** 插件段的格式无关传输快照；installed 数组序 = 规范展示序 */
export interface PluginsTransfer {
    readonly installed: readonly InstalledPluginTransfer[];
    readonly subscriptions: readonly Readonly<SubscribeSource>[];
    readonly alternatives: readonly PluginAlternativeTransfer[];
}

/** 恢复安装失败原因：复用 InstallResult 的失败原因，外加意外异常 */
/** 安装结果里的失败分支（UI 层据此出文案） */
export type InstallFailure = Extract<InstallResult, { ok: false }>;

export type PluginInstallFailureReason =
    | InstallFailure['reason']
    | 'unexpected';

/** 单个插件安装失败明细（供结果页展示） */
export interface PluginInstallFailure {
    readonly srcUrl: string;
    readonly reason: PluginInstallFailureReason;
}

/** restorePlugins 的逐类结果计数（安装失败带明细） */
export interface PluginsRestoreResult {
    /** 新装成功的插件数 */
    pluginsInstalled: number;
    /** 已装（同 srcUrl 或装出的 platform 已被占）而跳过的数 */
    pluginsSkipped: number;
    /** 安装失败明细（srcUrl + 原因）；数量 = length */
    pluginInstallFailures: readonly PluginInstallFailure[];
    /** 新增订阅数 */
    subscriptionsAdded: number;
    /** 已有（同 url）而跳过的订阅数 */
    subscriptionsSkipped: number;
    /** 新增替代源数 */
    alternativesAdded: number;
    /** 已有（同 platform）而跳过的替代源数 */
    alternativesSkipped: number;
}

/**
 * 供 core/backup 使用的插件段传输能力；plugin 负责一致快照与恢复，core/backup 负责 envelope / 解析 / 文件 / WebDAV
 * 恢复恒增量（绝不卸载）、纯加法（已存在按身份跳过、不改用户现有配置）、best-effort
 * 输入须为 core/backup 校验过的 canonical 形状；不含插件用户变量（凭据）
 */
export interface IPluginTransfer {
    snapshotPlugins(): Promise<PluginsTransfer>;
    restorePlugins(input: PluginsTransfer): Promise<PluginsRestoreResult>;
}

/** PluginManager 构造注入依赖（仅跨模块 config；源码 store 是域内协作者，内部 new） */
export interface PluginManagerDeps {
    config: IConfig;
}
