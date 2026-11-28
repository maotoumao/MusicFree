import type { ConfigSchema, IConfig } from '@/core/config';
import type { IErrorLog } from '@/core/errorLog';
import type {
    DeepReadonly,
    MediaRef,
    MusicItem,
    PlaylistItemBase,
} from '@/types';
import type { LOCAL_MEDIA_PLATFORM } from '@/utils/media';

/** 内建「我喜欢」歌单 ID（legacy wire，禁止修改） */
export const FAVORITE_PLAYLIST_ID = 'favorite';

/** 本地歌单标题最大长度（按 UTF-16 码元计） */
export const LOCAL_PLAYLIST_TITLE_MAX_LENGTH = 120;

/** 本地歌单简介最大长度（按 UTF-16 码元计） */
export const LOCAL_PLAYLIST_DESCRIPTION_MAX_LENGTH = 2000;

/** 歌单音乐的展示顺序；字段升序为裸值，降序加 `Desc` 后缀 */
export enum PlaylistMusicSortMode {
    /** 当前数组顺序（用户手动排序） */
    Manual = 'manual',
    /** 按歌曲标题升序 */
    Title = 'title',
    /** 按歌曲标题降序 */
    TitleDesc = 'titleDesc',
    /** 按歌手升序 */
    Artist = 'artist',
    /** 按歌手降序 */
    ArtistDesc = 'artistDesc',
    /** 按专辑升序 */
    Album = 'album',
    /** 按专辑降序 */
    AlbumDesc = 'albumDesc',
    /** 按加入时间升序（最早加入在前） */
    AddedAt = 'addedAt',
    /** 按加入时间降序（最近加入在前） */
    AddedAtDesc = 'addedAtDesc',
}

/**
 * config `playlist.defaultMusicSortMode` 的值 → 枚举
 * Record 类型 + 枚举计算键：config 增删值、或键写错都会在此编译失败
 */
export const CONFIG_SORT_MODE: Record<
    ConfigSchema['playlist.defaultMusicSortMode'],
    PlaylistMusicSortMode
> = {
    [PlaylistMusicSortMode.Manual]: PlaylistMusicSortMode.Manual,
    [PlaylistMusicSortMode.Title]: PlaylistMusicSortMode.Title,
    [PlaylistMusicSortMode.TitleDesc]: PlaylistMusicSortMode.TitleDesc,
    [PlaylistMusicSortMode.Artist]: PlaylistMusicSortMode.Artist,
    [PlaylistMusicSortMode.ArtistDesc]: PlaylistMusicSortMode.ArtistDesc,
    [PlaylistMusicSortMode.Album]: PlaylistMusicSortMode.Album,
    [PlaylistMusicSortMode.AlbumDesc]: PlaylistMusicSortMode.AlbumDesc,
    [PlaylistMusicSortMode.AddedAt]: PlaylistMusicSortMode.AddedAt,
    [PlaylistMusicSortMode.AddedAtDesc]: PlaylistMusicSortMode.AddedAtDesc,
};

/** Local playlist 的公共只读模型，与允许插件扩展字段的 PlaylistItemBase 隔离 */
interface LocalPlaylistBase {
    readonly platform: typeof LOCAL_MEDIA_PLATFORM;
    readonly title: string;
    /** 用户自定义封面优先，否则取最近加入且有封面那首的 artwork（自动封面） */
    readonly artwork?: string;
    readonly description?: string;
    readonly musicCount: number;
    readonly createdAt: number;
    /** true 表示 artwork 由用户设置；false 表示自动取最近加入的有封面歌曲 */
    readonly hasCustomArtwork: boolean;
}

export interface FavoritePlaylist extends LocalPlaylistBase {
    readonly id: typeof FAVORITE_PLAYLIST_ID;
    readonly kind: 'favorite';
}

export interface UserLocalPlaylist extends LocalPlaylistBase {
    /** 运行时保证不等于 FAVORITE_PLAYLIST_ID */
    readonly id: string;
    readonly kind: 'user';
}

export type LocalPlaylist = FavoritePlaylist | UserLocalPlaylist;

/** 已加载的 Local playlist 快照 */
export type LocalPlaylistDetail = LocalPlaylist & {
    readonly musicList: readonly MusicItem[];
    readonly sortMode: PlaylistMusicSortMode;
};

/** Starred playlist 传输项（歌单头 + 可选内嵌曲目快照）；也是 StarredPlaylist 的可变基形 */
export type StarredPlaylistTransferItem = PlaylistItemBase & {
    readonly musicList?: readonly MusicItem[];
};

/** Starred playlist 的递归只读快照，保留插件扩展字段和内嵌的可选 musicList */
export type StarredPlaylist = DeepReadonly<StarredPlaylistTransferItem>;

export interface CreateLocalPlaylistInput {
    title: string;
    description?: string;
}

export interface UpdateLocalPlaylistPatch {
    /** favorite 歌单不允许修改标题 */
    title?: string;
    /** null 清除描述；undefined 不修改 */
    description?: string | null;
}

export interface AddMusicResult {
    added: number;
    duplicates: number;
    invalid: number;
}

export interface RemoveMusicResult {
    removed: number;
    missing: number;
}

export interface RemoveLocalPlaylistsResult {
    removed: number;
    missing: number;
    /** 因受保护而未删除的歌单数量（当前仅 favorite） */
    protectedSkipped: number;
}

/** Local playlist 的格式无关传输快照，不包含备份版本或 envelope */
export interface LocalPlaylistTransferItem {
    readonly id: string;
    readonly title: string;
    /** 歌单描述 */
    readonly description?: string;
    /** 歌单创建时间（毫秒） */
    readonly createdAt?: number;
    /** 曲目展示排序偏好（缺省回落 manual） */
    readonly sortMode?: PlaylistMusicSortMode;
    /** 曲目按 manual 顺序排列；sortMode 只是展示偏好 */
    readonly musicList: readonly MusicItem[];
}

/**
 * append：保留全部现有数据，将输入 favorite 合入当前 favorite，并为其他输入歌单分配新 ID
 * overwrite：原子替换全部 Local playlists，保留 favorite 身份并清空后导入；不得修改 Starred playlists
 * 输入须为 core/backup 校验过的 canonical 形状（恰一个 favorite、歌单 id 无重复、字段合法）
 * 本端口不重复形状校验，只在写入时按 (platform,id) 去重并计数无效曲；普通歌单不得沿用输入 ID
 * 恢复后曲目按输入数组序落库（manual 持久化顺序）；歌单展示 sortMode 沿用输入、缺省回落 manual
 * 任一持久化步骤失败时，必须回滚或通过恢复日志还原旧快照，以 PersistenceFailed reject，且不得发布部分结果
 */
export type LocalPlaylistRestoreMode = 'append' | 'overwrite';

export interface LocalPlaylistRestoreResult {
    /** 创建的普通 Local playlists 数量（不含固定 favorite） */
    localPlaylistsCreated: number;
    musicAdded: number;
    musicDuplicatesSkipped: number;
    invalidMusicSkipped: number;
}

/** 领域失败和持久化失败的稳定错误码，由 IPlaylist 异步命令通过 reject 暴露 */
export enum PlaylistErrorCode {
    LocalPlaylistNotFound = 'LOCAL_PLAYLIST_NOT_FOUND',
    FavoriteTitleProtected = 'FAVORITE_TITLE_PROTECTED',
    InvalidLocalPlaylistOrder = 'INVALID_LOCAL_PLAYLIST_ORDER',
    InvalidMusicOrder = 'INVALID_MUSIC_ORDER',
    InvalidStarredPlaylistOrder = 'INVALID_STARRED_PLAYLIST_ORDER',
    InvalidInput = 'INVALID_INPUT',
    ArtworkSourceUnavailable = 'ARTWORK_SOURCE_UNAVAILABLE',
    PersistenceFailed = 'PERSISTENCE_FAILED',
    /** 底层存储降级只读（index 损坏累及全模块，或 favorite 局部损坏）时，增量写命令以此 reject */
    StorageDegraded = 'STORAGE_DEGRADED',
}

export interface PlaylistOperationError extends Error {
    readonly code: PlaylistErrorCode;
}

/**
 * 歌单模块的存储健康状态
 * ready：底层数据可信，读写正常
 * degraded：index 损坏会殃及全部歌单，整模块切只读以保护尚可恢复的 raw；增量写 reject，恢复写放行
 */
export type PlaylistStatus = 'ready' | 'degraded';

/**
 * 分别管理 Local playlists 和 Starred playlists 的歌单领域端口
 * 除非返回值明确表示 missing、protected 或幂等未变化，否则未知 ID、非法顺序、非法输入和 I/O 失败
 * 必须 reject 带 PlaylistErrorCode 的 PlaylistOperationError，不得静默忽略或发布未持久化状态
 * 例外：setup 恒 resolve（见其注释）；degraded（见 getStatus）时增量写以 StorageDegraded reject、读返回当前可信快照、恢复写（restore-overwrite / reset）放行
 */
export interface IPlaylist {
    /**
     * 幂等启动：恒 resolve，绝不因数据问题 reject
     * index 损坏殃及全部歌单，故整模块进 degraded 只读（保留 raw、拒增量写、经 getStatus 暴露）
     * 单个歌单损坏（含 favorite）本地化、模块仍 ready：该歌单 loadLocalPlaylist reject；favorite 另使 isFavorite 退化为 false
     */
    setup(): Promise<void>;
    /** 当前存储健康状态；degraded 时写命令以 StorageDegraded reject（仅 restoreLocalPlaylists 的 overwrite 作为恢复写放行） */
    getStatus(): PlaylistStatus;

    // Local playlists
    getLocalPlaylists(): readonly LocalPlaylist[];
    /** 不存在时返回 null；存储读取失败时 reject */
    loadLocalPlaylist(id: string): Promise<LocalPlaylistDetail | null>;
    createLocalPlaylist(input: CreateLocalPlaylistInput): Promise<string>;
    /** 未知 ID、favorite 改标题或持久化失败时 reject PlaylistOperationError */
    updateLocalPlaylist(
        id: string,
        patch: UpdateLocalPlaylistPatch,
    ): Promise<void>;
    /**
     * sourceUri 为 null 时恢复为自动封面；否则应为 picker（documentPicker）已暂存到缓存的 file:// URI
     * 缓存可能被系统清理，故 core 必须再复制到 app 托管持久目录
     * 新文件复制并提交成功后才清理旧文件；源不可读或持久化失败时保留旧封面并 reject
     */
    setLocalPlaylistArtwork(
        id: string,
        sourceUri: string | null,
    ): Promise<void>;
    removeLocalPlaylists(
        ids: readonly string[],
    ): Promise<RemoveLocalPlaylistsResult>;
    /** orderedUserIds 必须无重复且完整覆盖全部 UserLocalPlaylist；否则以 InvalidLocalPlaylistOrder reject，favorite 始终固定在首位 */
    reorderLocalPlaylists(orderedUserIds: readonly string[]): Promise<void>;

    // Local playlist music
    addMusicToLocalPlaylist(
        playlistId: string,
        items: MusicItem | readonly MusicItem[],
    ): Promise<AddMusicResult>;
    removeMusicFromLocalPlaylist(
        playlistId: string,
        refs: MediaRef | readonly MediaRef[],
    ): Promise<RemoveMusicResult>;
    clearLocalPlaylistMusic(playlistId: string): Promise<number>;
    /** order 必须无重复且完整覆盖当前歌单的全部 MusicItem；否则以 InvalidMusicOrder reject，成功后切换为 manual */
    reorderLocalPlaylistMusic(
        playlistId: string,
        order: readonly MediaRef[],
    ): Promise<void>;
    /**
     * 用 items 整体覆盖歌单曲目（成员 + manual 顺序）；items 内按 platform+id 去重保首条、非法项跳过、可为空（即清空）
     * 匹配原曲目沿用其加入时间（保加入时间排序与封面派生），新曲目用当前时间
     * markManualOrder 为真 → 切 sortMode 为 Manual（用户手动排过）；否则保持当前排序模式
     */
    setLocalPlaylistMusic(
        playlistId: string,
        items: readonly MusicItem[],
        options?: { markManualOrder?: boolean },
    ): Promise<void>;
    setLocalPlaylistMusicSortMode(
        playlistId: string,
        mode: PlaylistMusicSortMode,
    ): Promise<void>;

    // favorite
    // 「加/删指定状态」用通用的 addMusicToLocalPlaylist / removeMusicFromLocalPlaylist（favorite 就是一个本地歌单）
    isFavorite(ref: MediaRef): boolean;
    /**
     * 翻转收藏态，返回翻转后的状态（true=已收藏）。
     * 当前态在串行队列内读取，故连点不会因读到旧值而丢掉一次
     */
    toggleFavorite(item: MusicItem): Promise<boolean>;
    /**
     * 收藏集合被重新发布（供非 React 消费者，如通知栏按钮；禁直订 favoriteKeys atom）。
     * 只是「可能变了」的信号，具体状态自行 isFavorite 查——成员未变时也可能触发（如排序模式变化），
     * 故回调须幂等；不回放当前值，返回退订
     */
    subscribeFavoriteChange(cb: () => void): () => void;

    // Starred playlists
    /** 返回递归只读快照，不泄漏内部引用 */
    getStarredPlaylists(): readonly StarredPlaylist[];
    isPlaylistStarred(ref: MediaRef): boolean;
    /**
     * 输入先经序列化校验和深拷贝，存为自有快照，不保留调用方引用
     * 已有相同 MediaRef 时替换其快照并保留排序位置；返回是否新增
     */
    starPlaylist(item: PlaylistItemBase): Promise<boolean>;
    /** 返回是否实际移除 */
    unstarPlaylist(ref: MediaRef): Promise<boolean>;
    /** 批量取消收藏（单次提交）；返回实际移除数量，未命中的 ref 跳过 */
    unstarPlaylists(refs: readonly MediaRef[]): Promise<number>;
    /** order 必须无重复且完整覆盖全部 Starred playlist；否则以 InvalidStarredPlaylistOrder reject */
    reorderStarredPlaylists(order: readonly MediaRef[]): Promise<void>;
}

/**
 * 供 core/backup 使用的格式无关传输能力，不属于 UX 使用的主 IPlaylist
 * core/backup 负责版本化 envelope、解析、文件和 WebDAV；playlist 负责一致快照和原子恢复
 */
export interface ILocalPlaylistTransfer {
    snapshotLocalPlaylists(): Promise<
        readonly DeepReadonly<LocalPlaylistTransferItem>[]
    >;
    restoreLocalPlaylists(
        playlists: readonly DeepReadonly<LocalPlaylistTransferItem>[],
        mode: LocalPlaylistRestoreMode,
    ): Promise<LocalPlaylistRestoreResult>;
}

/**
 * append：保留现有收藏，按 (platform,id) 合入尚未收藏的项、前插（最近加入在前）
 * overwrite：整体替换全部收藏
 * 两种模式都要求模块 ready（收藏恢复修不了 index-degraded，那是 Local 恢复的事）；
 * append 还要求收藏存储可信；overwrite 可就地修复收藏存储自身的损坏
 * 输入须为 core/backup 校验过的 canonical 形状（platform+id 无重复、非本地平台）
 * 本端口不重复形状校验，只按 (platform,id) 去重、剔非法项并计入 starredSkipped
 * 单 store 一次原子写：写失败以 PersistenceFailed reject、不发布部分结果；不碰迁移 $version
 */
export type StarredPlaylistRestoreMode = 'append' | 'overwrite';

export interface StarredPlaylistRestoreResult {
    /** 实际写入的收藏歌单数 */
    starredAdded: number;
    /** 因非法、append 下已收藏、或输入批内重复而跳过的数 */
    starredSkipped: number;
}

/**
 * 供 core/backup 使用的 Starred playlists 传输能力，与 ILocalPlaylistTransfer 分离（local 与 starred 语义不同）
 * playlist 负责一致快照与原子恢复；core/backup 负责 envelope / 解析 / 文件 / WebDAV
 */
export interface IStarredTransfer {
    snapshotStarredPlaylists(): Promise<readonly StarredPlaylist[]>;
    restoreStarredPlaylists(
        playlists: readonly DeepReadonly<StarredPlaylistTransferItem>[],
        mode: StarredPlaylistRestoreMode,
    ): Promise<StarredPlaylistRestoreResult>;
}

export interface PlaylistDeps {
    config: IConfig;
    /** 本地数据在启动装载 / 迁移时损坏或抛错的静默降级路径，只往这里留痕（不弹任何提示） */
    errorLog: IErrorLog;
}
