/**
 * Local + Starred playlists 聚合：IPlaylist 的运行时
 * #summaries/#starred 是命令侧的内存镜像；store atoms 是发布给 React 的响应式读模型
 * 写入经串行链、MMKV 成功才发布；setup 恒 resolve，迁移失败或 index 损坏都进 degraded 只读
 */
import {
    getOrCreateMMKV,
    getStoreVersion,
    setStoreVersion,
} from '@/infra/storage';
import { safeParse, safeStringify } from '@/utils/json';
import { isLocalPlatform, LOCAL_MEDIA_PLATFORM, mediaKey } from '@/utils/media';
import { clampToMaxLength } from '@/utils/text';

import { persistArtwork, removeArtwork } from './artworkStore';
import { playlistMigrations, runMigrations } from './migrations';
import { MusicCollection } from './musicCollection';
import {
    PLAYLIST_DATA_KEY,
    PLAYLIST_INDEX_STORE_ID,
    PLAYLIST_SORT_KEY,
    playlistStoreId,
    readIndex,
    readMusic,
    readSortMode,
    readStarred,
    STARRED_STORE_ID,
    writeIndex,
    writeMusic,
    writeSortMode,
    writeStarred,
} from './storage';
import {
    getLocalPlaylists as readPublishedPlaylists,
    getStarredPlaylists as readPublishedStarred,
    removeLoadedDetails,
    setFavoriteKeys,
    setLoadedDetail,
    setLocalPlaylists,
    setPlaylistStatus,
    setStarredKeys,
    setStarredPlaylists,
} from './store';
import {
    CONFIG_SORT_MODE,
    FAVORITE_PLAYLIST_ID,
    LOCAL_PLAYLIST_DESCRIPTION_MAX_LENGTH,
    LOCAL_PLAYLIST_TITLE_MAX_LENGTH,
    PlaylistErrorCode,
    PlaylistMusicSortMode,
} from './types';

import type { StoreVersionCell } from './migrations';
import type {
    StoredFavoriteSummary,
    StoredPlaylistSummary,
    StoredUserSummary,
} from './storage';
import type {
    AddMusicResult,
    CreateLocalPlaylistInput,
    IPlaylist,
    ILocalPlaylistTransfer,
    IStarredTransfer,
    LocalPlaylist,
    LocalPlaylistDetail,
    LocalPlaylistRestoreMode,
    LocalPlaylistRestoreResult,
    LocalPlaylistTransferItem,
    PlaylistDeps,
    PlaylistOperationError,
    PlaylistStatus,
    RemoveLocalPlaylistsResult,
    RemoveMusicResult,
    StarredPlaylist,
    StarredPlaylistRestoreMode,
    StarredPlaylistRestoreResult,
    StarredPlaylistTransferItem,
    UpdateLocalPlaylistPatch,
    UserLocalPlaylist,
} from './types';
import type { IConfig } from '@/core/config';
import type { IErrorLog } from '@/core/errorLog';
import type {
    DeepReadonly,
    MediaRef,
    MusicItem,
    PlaylistItemBase,
} from '@/types';
import type { MMKV } from 'react-native-mmkv';

const noop = (): void => {};

/** fire-and-forget：best-effort 清理任务，不阻塞命令、不关心结果 */
function detach(task: Promise<unknown>): void {
    task.catch(noop);
}

/** 新歌单 id 的进程内计数器，配合时钟保证唯一 */
let idCounter = 0;

/** 日志里最多点名几个跳过的歌单 id：数量已单独写明，整面 id 墙既占存储也没法读 */
const SKIPPED_IDS_IN_LOG = 5;

function describeSkippedIds(ids: readonly string[]): string {
    const head = ids.slice(0, SKIPPED_IDS_IN_LOG).join(', ');
    return ids.length > SKIPPED_IDS_IN_LOG
        ? `${head} 等 ${ids.length} 个`
        : head;
}

export class Playlist
    implements IPlaylist, ILocalPlaylistTransfer, IStarredTransfer
{
    readonly #config: IConfig;
    readonly #errorLog: IErrorLog;
    /** 本轮 setup / 恢复期间记下的本地数据问题，flush 时合成一条记录 */
    #localDataIssues: string[] = [];
    readonly #index: MMKV = getOrCreateMMKV(PLAYLIST_INDEX_STORE_ID);
    #status: PlaylistStatus = 'ready';
    #summaries: readonly StoredPlaylistSummary[] = [];
    /** 常驻 favorite 曲目，换 O(1) isFavorite；setup eager 载 */
    #favorite: MusicCollection = MusicCollection.empty(
        PlaylistMusicSortMode.Manual,
    );
    /** favorite 曲目损坏：isFavorite 退 false、写命令 reject，护住可恢复 raw */
    #favoriteCorrupt = false;
    /** favorite 变化的非 React 订阅者（通知栏按钮等） */
    readonly #favoriteListeners = new Set<() => void>();
    /** 常驻 starred（收藏的远程歌单）快照 + O(1) 成员键；setup eager 载 */
    #starred: readonly StarredPlaylist[] = [];
    #starredKeys: ReadonlySet<string> = new Set<string>();
    /** starred 存储损坏：isPlaylistStarred 退 false、写命令 reject，护住可恢复 raw */
    #starredCorrupt = false;
    readonly #starredStore: MMKV = getOrCreateMMKV(STARRED_STORE_ID);
    /** 懒加载的普通歌单曲目缓存 */
    #loaded = new Map<string, MusicCollection>();
    /** 写入串行链：命令依次落盘，杜绝并发读改写竞态 */
    #chain: Promise<unknown> = Promise.resolve();
    /** setup 记忆化：真正初始化只跑一次，后续调用复用同一 Promise */
    #setupPromise?: Promise<void>;

    constructor(deps: PlaylistDeps) {
        this.#config = deps.config;
        this.#errorLog = deps.errorLog;
    }

    /**
     * 幂等启动：只初始化一次、恒 resolve
     * 迁移失败或 index 损坏/重复 id → 整模块 degraded 只读，绝不建 favorite 覆盖损坏数据、不发布半迁移态
     */
    setup(): Promise<void> {
        this.#setupPromise ??= this.#runSetup();
        return this.#setupPromise;
    }

    #runSetup(): Promise<void> {
        let migrated = true;
        try {
            this.#migrate();
        } catch (error) {
            // 迁移失败：版本没 bump、下次重放；此次禁写以防重放覆盖用户新数据
            migrated = false;
            this.#noteLocalDataIssue('legacy 歌单迁移中止，本次只读', error);
        }
        this.#hydrate(migrated);
        if (this.#status === 'ready') {
            // 分别接住装载阶段向外抛的异常并记下，让另一项继续初始化；抛出的那一项按「损坏」处理——
            // 它的内存镜像可能只发布了一半，置 corrupt 让写闸关上，避免用半份镜像整表覆盖盘上数据
            try {
                this.#loadFavorite();
            } catch (error) {
                this.#favoriteCorrupt = true;
                this.#noteLocalDataIssue(
                    'favorite 装载抛错，按损坏只读',
                    error,
                );
            }
            try {
                this.#loadStarred();
            } catch (error) {
                this.#starredCorrupt = true;
                this.#noteLocalDataIssue('starred 装载抛错，按损坏只读', error);
            }
        }
        this.#flushLocalDataIssues();
        return Promise.resolve();
    }

    /**
     * 记下一条本地数据问题，等 #flushLocalDataIssues 合成一条错误记录
     * 一次启动只落一条：错误日志按「与最新一条相同」去重，一次启动若落两条不同记录，重启重放时会交替新增、
     * 几次就把有限的日志位填满，挤掉用户真正想反馈的那条
     */
    #noteLocalDataIssue(message: string, cause?: unknown): void {
        const detail =
            cause instanceof Error && cause.message
                ? `${message}（${cause.message}）`
                : message;
        this.#localDataIssues.push(detail);
    }

    /** 把本轮记下的本地数据问题合成一条进错误日志，不弹提示（用户能在「关于 → 错误日志」看到） */
    #flushLocalDataIssues(): void {
        if (this.#localDataIssues.length === 0) {
            return;
        }
        const error = new Error(this.#localDataIssues.join('；'));
        error.name = 'LocalDataDegraded';
        this.#localDataIssues = [];
        this.#errorLog.capture({ source: 'localData', error });
    }

    getStatus(): PlaylistStatus {
        return this.#status;
    }

    getLocalPlaylists(): readonly LocalPlaylist[] {
        return readPublishedPlaylists();
    }

    createLocalPlaylist(input: CreateLocalPlaylistInput): Promise<string> {
        return this.#enqueue(() => {
            this.#assertWritable();
            // 空白标题被接受（兼容），显示层对空串回落默认标题
            // 标题/简介按上限截断，兜底越过 UI 的超长输入
            const summary: StoredPlaylistSummary = {
                id: this.#freshId(),
                kind: 'user',
                title: clampToMaxLength(
                    input.title.trim(),
                    LOCAL_PLAYLIST_TITLE_MAX_LENGTH,
                ),
                description:
                    input.description === undefined
                        ? undefined
                        : clampToMaxLength(
                              input.description,
                              LOCAL_PLAYLIST_DESCRIPTION_MAX_LENGTH,
                          ),
                artwork: undefined,
                hasCustomArtwork: false,
                musicCount: 0,
                createdAt: Date.now(),
            };
            // favorite 固定居首，新歌单插其后
            const [favorite, ...rest] = this.#summaries;
            this.#commitSummaries([favorite!, summary, ...rest]);
            return summary.id;
        });
    }

    updateLocalPlaylist(
        id: string,
        patch: UpdateLocalPlaylistPatch,
    ): Promise<void> {
        return this.#enqueue(() => {
            this.#assertWritable();
            const { index, summary } = this.#locate(id);
            if (patch.title !== undefined && summary.kind === 'favorite') {
                throw operationError(PlaylistErrorCode.FavoriteTitleProtected);
            }
            // 空白标题被接受（兼容），显示层对空串回落默认标题
            // 标题/简介按上限截断，兜底越过 UI 的超长输入
            const title =
                patch.title !== undefined
                    ? clampToMaxLength(
                          patch.title.trim(),
                          LOCAL_PLAYLIST_TITLE_MAX_LENGTH,
                      )
                    : summary.title;
            const description =
                patch.description === undefined
                    ? summary.description
                    : patch.description === null
                    ? undefined
                    : clampToMaxLength(
                          patch.description,
                          LOCAL_PLAYLIST_DESCRIPTION_MAX_LENGTH,
                      );
            this.#commitSummaries(
                this.#replaceAt(index, { ...summary, title, description }),
            );
            this.#refreshDetail(id);
        });
    }

    removeLocalPlaylists(
        ids: readonly string[],
    ): Promise<RemoveLocalPlaylistsResult> {
        return this.#enqueue(() => {
            this.#assertWritable();
            const targets = new Set(ids);
            const removedSummaries: StoredPlaylistSummary[] = [];
            let protectedSkipped = 0;
            const kept = this.#summaries.filter(summary => {
                if (!targets.has(summary.id)) {
                    return true;
                }
                if (summary.kind === 'favorite') {
                    protectedSkipped += 1;
                    return true;
                }
                removedSummaries.push(summary);
                return false;
            });
            const removed = removedSummaries.length;
            if (removed > 0) {
                this.#commitSummaries(kept);
                for (const summary of removedSummaries) {
                    cleanupRemoved(summary);
                    this.#loaded.delete(summary.id);
                }
                removeLoadedDetails(removedSummaries.map(s => s.id));
            }
            return {
                removed,
                missing: targets.size - removed - protectedSkipped,
                protectedSkipped,
            };
        });
    }

    reorderLocalPlaylists(orderedUserIds: readonly string[]): Promise<void> {
        return this.#enqueue(() => {
            this.#assertWritable();
            const [favorite, ...users] = this.#summaries;
            if (orderedUserIds.length !== users.length) {
                throw operationError(
                    PlaylistErrorCode.InvalidLocalPlaylistOrder,
                );
            }
            const byId = new Map(users.map(summary => [summary.id, summary]));
            const used = new Set<string>();
            const reordered: StoredPlaylistSummary[] = [];
            for (const id of orderedUserIds) {
                const summary = byId.get(id);
                if (!summary || used.has(id)) {
                    throw operationError(
                        PlaylistErrorCode.InvalidLocalPlaylistOrder,
                    );
                }
                used.add(id);
                reordered.push(summary);
            }
            this.#commitSummaries([favorite!, ...reordered]);
        });
    }

    setLocalPlaylistArtwork(
        id: string,
        sourceUri: string | null,
    ): Promise<void> {
        return this.#enqueue(async () => {
            this.#assertWritable();
            const { index, summary } = this.#locate(id);
            // 摘要（artwork + hasCustomArtwork）是自定义封面的单一权威值，单次 index 写即原子提交
            const oldPath = summary.hasCustomArtwork
                ? summary.artwork
                : undefined;
            if (sourceUri === null) {
                this.#commitSummaries(
                    this.#replaceAt(index, {
                        ...summary,
                        hasCustomArtwork: false,
                        artwork: this.#loadedArtwork(id),
                    }),
                );
                this.#refreshDetail(id);
                if (oldPath) {
                    detach(removeArtwork(oldPath));
                }
                return;
            }
            let managed: string;
            try {
                managed = await persistArtwork(id, sourceUri);
            } catch {
                throw operationError(
                    PlaylistErrorCode.ArtworkSourceUnavailable,
                );
            }
            try {
                this.#commitSummaries(
                    this.#replaceAt(index, {
                        ...summary,
                        hasCustomArtwork: true,
                        artwork: managed,
                    }),
                );
            } catch (persistErr) {
                // index 写失败：清掉刚复制的新封面、保留旧封面，冒泡 PersistenceFailed
                detach(removeArtwork(managed));
                throw persistErr;
            }
            this.#refreshDetail(id);
            if (oldPath && oldPath !== managed) {
                detach(removeArtwork(oldPath));
            }
        });
    }

    loadLocalPlaylist(id: string): Promise<LocalPlaylistDetail | null> {
        return this.#enqueue(() => {
            if (!this.#summaries.some(s => s.id === id)) {
                return null;
            }
            const collection = this.#collectionOf(id);
            // 打开时按当前规则校准摘要缓存（封面派生规则升级后自愈；未变则 no-op）
            this.#refreshSummary(id, collection);
            const detail = this.#detailOf(id, collection);
            setLoadedDetail(id, detail);
            return detail;
        });
    }

    addMusicToLocalPlaylist(
        playlistId: string,
        items: MusicItem | readonly MusicItem[],
    ): Promise<AddMusicResult> {
        return this.#enqueue(() => {
            this.#assertMusicWritable(playlistId);
            const { collection, result } = this.#collectionOf(playlistId).add(
                normalizeItems(items),
                Date.now(),
            );
            if (result.added > 0) {
                this.#commitMusic(playlistId, collection);
            }
            return result;
        });
    }

    removeMusicFromLocalPlaylist(
        playlistId: string,
        refs: MediaRef | readonly MediaRef[],
    ): Promise<RemoveMusicResult> {
        return this.#enqueue(() => {
            this.#assertMusicWritable(playlistId);
            const { collection, result } = this.#collectionOf(
                playlistId,
            ).remove(normalizeRefs(refs));
            if (result.removed > 0) {
                this.#commitMusic(playlistId, collection);
            }
            return result;
        });
    }

    clearLocalPlaylistMusic(playlistId: string): Promise<number> {
        return this.#enqueue(() => {
            this.#assertMusicWritable(playlistId);
            const { collection, removed } =
                this.#collectionOf(playlistId).clear();
            if (removed > 0) {
                this.#commitMusic(playlistId, collection);
            }
            return removed;
        });
    }

    reorderLocalPlaylistMusic(
        playlistId: string,
        order: readonly MediaRef[],
    ): Promise<void> {
        return this.#enqueue(() => {
            this.#assertMusicWritable(playlistId);
            const next = this.#collectionOf(playlistId).reorder(order);
            if (!next) {
                throw operationError(PlaylistErrorCode.InvalidMusicOrder);
            }
            this.#commitMusic(playlistId, next);
        });
    }

    setLocalPlaylistMusic(
        playlistId: string,
        items: readonly MusicItem[],
        options?: { markManualOrder?: boolean },
    ): Promise<void> {
        return this.#enqueue(() => {
            this.#assertMusicWritable(playlistId);
            const base = this.#collectionOf(playlistId).setItems(
                items,
                Date.now(),
            );
            const next = options?.markManualOrder
                ? base.withSortMode(PlaylistMusicSortMode.Manual)
                : base;
            this.#commitMusic(playlistId, next);
        });
    }

    setLocalPlaylistMusicSortMode(
        playlistId: string,
        mode: PlaylistMusicSortMode,
    ): Promise<void> {
        return this.#enqueue(() => {
            this.#assertMusicWritable(playlistId);
            const collection = this.#collectionOf(playlistId);
            const next = collection.withSortMode(mode);
            if (next === collection) {
                return;
            }
            const store = getOrCreateMMKV(playlistStoreId(playlistId));
            try {
                writeSortMode(store, mode);
            } catch {
                throw operationError(PlaylistErrorCode.PersistenceFailed);
            }
            this.#setCollection(playlistId, next);
            this.#refreshSummary(playlistId, next);
            setLoadedDetail(playlistId, this.#detailOf(playlistId, next));
        });
    }

    isFavorite(ref: MediaRef): boolean {
        return this.#favorite.has(ref);
    }

    subscribeFavoriteChange(cb: () => void): () => void {
        this.#favoriteListeners.add(cb);
        return () => {
            this.#favoriteListeners.delete(cb);
        };
    }

    toggleFavorite(item: MusicItem): Promise<boolean> {
        return this.#enqueue(() => {
            this.#assertMusicWritable(FAVORITE_PLAYLIST_ID);
            // 当前态在队列内读：放到入队前读会让连点两次拿到同一个旧值，只翻转一次
            if (this.#favorite.has(item)) {
                const { collection } = this.#favorite.remove([item]);
                this.#commitMusic(FAVORITE_PLAYLIST_ID, collection);
                return false;
            }
            const { collection } = this.#favorite.add([item], Date.now());
            this.#commitMusic(FAVORITE_PLAYLIST_ID, collection);
            return true;
        });
    }

    // —— Starred（收藏的远程歌单）——

    getStarredPlaylists(): readonly StarredPlaylist[] {
        return readPublishedStarred();
    }

    isPlaylistStarred(ref: MediaRef): boolean {
        return this.#starredKeys.has(mediaKey(ref));
    }

    starPlaylist(item: PlaylistItemBase): Promise<boolean> {
        return this.#enqueue(() => {
            this.#assertStarredWritable();
            const clean = coerceStarred(item);
            if (!clean) {
                throw operationError(PlaylistErrorCode.InvalidInput);
            }
            const key = mediaKey(clean);
            const index = this.#starred.findIndex(p => mediaKey(p) === key);
            if (index >= 0) {
                // 已收藏：替换快照、保留原位置；不算新增
                const next = this.#starred.slice();
                next[index] = clean;
                this.#commitStarred(next);
                return false;
            }
            // 新收藏置顶（newest-first，对齐 legacy）
            this.#commitStarred([clean, ...this.#starred]);
            return true;
        });
    }

    unstarPlaylist(ref: MediaRef): Promise<boolean> {
        return this.#enqueue(() => {
            this.#assertStarredWritable();
            const key = mediaKey(ref);
            const next = this.#starred.filter(p => mediaKey(p) !== key);
            if (next.length === this.#starred.length) {
                return false;
            }
            this.#commitStarred(next);
            return true;
        });
    }

    unstarPlaylists(refs: readonly MediaRef[]): Promise<number> {
        return this.#enqueue(() => {
            this.#assertStarredWritable();
            const targets = new Set(refs.map(mediaKey));
            if (targets.size === 0) {
                return 0;
            }
            const next = this.#starred.filter(p => !targets.has(mediaKey(p)));
            const removed = this.#starred.length - next.length;
            if (removed > 0) {
                this.#commitStarred(next);
            }
            return removed;
        });
    }

    reorderStarredPlaylists(order: readonly MediaRef[]): Promise<void> {
        return this.#enqueue(() => {
            this.#assertStarredWritable();
            this.#commitStarred(reorderStarred(this.#starred, order));
        });
    }

    // —— 备份传输：快照侧 ——

    /** 一致快照全部 Local playlists（favorite 居首，曲目按 manual 顺序），供 core/backup 备份 */
    snapshotLocalPlaylists(): Promise<
        readonly DeepReadonly<LocalPlaylistTransferItem>[]
    > {
        return this.#enqueue(() => {
            // 存储不可信时拒绝：避免产出会在 overwrite 恢复时清空目标数据的误导性空/残缺备份
            if (this.#status === 'degraded' || this.#favoriteCorrupt) {
                throw operationError(PlaylistErrorCode.StorageDegraded);
            }
            // item 为集合内部引用；MusicCollection 不可变、消费方仅序列化，故不深拷贝（序列化即隔离）
            return this.#summaries.map(summary => {
                const collection = this.#snapshotCollection(summary.id);
                return {
                    id: summary.id,
                    title: summary.title,
                    description: summary.description,
                    createdAt: summary.createdAt,
                    sortMode: collection.sortMode,
                    musicList: collection.entries.map(entry => entry.item),
                };
            });
        });
    }

    /** 一致快照全部 Starred playlists（已 deepFrozen、不可变），供 core/backup 备份 */
    snapshotStarredPlaylists(): Promise<readonly StarredPlaylist[]> {
        return this.#enqueue(() => {
            if (this.#status === 'degraded' || this.#starredCorrupt) {
                throw operationError(PlaylistErrorCode.StorageDegraded);
            }
            return this.#starred;
        });
    }

    /**
     * 恢复普通歌单（含 favorite）到本机
     * append：向现有增量合并（favorite 合曲、其余各建新歌单），degraded 拒绝
     * overwrite：整体替换本机全部普通歌单，degraded 也放行（作为恢复写）
     */
    restoreLocalPlaylists(
        inputs: readonly DeepReadonly<LocalPlaylistTransferItem>[],
        mode: LocalPlaylistRestoreMode,
    ): Promise<LocalPlaylistRestoreResult> {
        return this.#enqueue(() => this.#restoreLocal(inputs, mode));
    }

    /**
     * 恢复 Starred playlists 到本机（单 store 一次原子写）
     * append：合入尚未收藏的项、前插；overwrite：整体替换（可修复 starred 存储损坏）
     * 两种模式都要求模块 ready——starred 恢复修不了 index-degraded，那是 restoreLocalPlaylists 的事
     */
    restoreStarredPlaylists(
        inputs: readonly DeepReadonly<StarredPlaylistTransferItem>[],
        mode: StarredPlaylistRestoreMode,
    ): Promise<StarredPlaylistRestoreResult> {
        return this.#enqueue(() => this.#restoreStarred(inputs, mode));
    }

    // —— 私有 ——

    /** 跑迁移阶梯：读写 Playlist.index/$version，v0→v1 从 legacy 一次性导入 */
    #migrate(): void {
        const versionCell: StoreVersionCell = {
            get: () => getStoreVersion(this.#index),
            set: version => setStoreVersion(this.#index, version),
        };
        runMigrations(
            versionCell,
            playlistMigrations(
                {
                    openStore: getOrCreateMMKV,
                    importedAt: Date.now(),
                },
                report => {
                    // 局部跳过不算失败（版本照常 bump），但用户会少见几个歌单，日志里得有名有姓
                    if (report.skippedLocalPlaylistIds.length > 0) {
                        this.#noteLocalDataIssue(
                            `legacy 导入跳过了 ${
                                report.skippedLocalPlaylistIds.length
                            } 个曲目数据损坏的歌单：${describeSkippedIds(
                                report.skippedLocalPlaylistIds,
                            )}`,
                        );
                    }
                    if (report.starredSkipped) {
                        this.#noteLocalDataIssue(
                            'legacy 收藏歌单数据损坏，未导入',
                        );
                    }
                },
            ),
        );
    }

    /** 水合 index：迁移失败/读盘异常/损坏/重复 id → degraded 只读；否则建镜像并保 favorite 居首 */
    #hydrate(migrated: boolean): void {
        if (!migrated) {
            this.#degrade(); // 成因已在 #runSetup 记下
            return;
        }
        let read: ReturnType<typeof readIndex>;
        try {
            read = readIndex(this.#index);
        } catch (error) {
            this.#noteLocalDataIssue('歌单索引读取失败，进入只读', error);
            this.#degrade();
            return;
        }
        if (read.status === 'corrupt') {
            this.#noteLocalDataIssue('歌单索引损坏，进入只读');
            this.#degrade();
            return;
        }
        if (read.status === 'valid' && hasDuplicateIds(read.value)) {
            this.#noteLocalDataIssue('歌单索引含重复 id，进入只读');
            this.#degrade();
            return;
        }
        const stored = read.status === 'valid' ? read.value : [];
        const normalized = ensureFavoriteFirst(stored);
        if (normalized !== stored) {
            try {
                writeIndex(this.#index, normalized);
            } catch (error) {
                // favorite 引导写失败：内存保留、下次启动重试
                this.#noteLocalDataIssue(
                    'favorite 引导写回失败，下次启动重试',
                    error,
                );
            }
        }
        this.#status = 'ready';
        this.#summaries = normalized;
        this.#publish();
    }

    /** 进入 degraded 只读：发布空可信快照，保留损坏 raw 不覆盖 */
    #degrade(): void {
        this.#status = 'degraded';
        this.#summaries = [];
        this.#publish();
    }

    /** 串行执行写命令：等前一条落定再跑，rejected 不断链 */
    #enqueue<T>(op: () => T | Promise<T>): Promise<T> {
        const result = this.#chain.then(op, op);
        this.#chain = result.then(noop, noop);
        return result;
    }

    #assertWritable(): void {
        if (this.#status === 'degraded') {
            throw operationError(PlaylistErrorCode.StorageDegraded);
        }
    }

    #locate(id: string): { index: number; summary: StoredPlaylistSummary } {
        const index = this.#summaries.findIndex(summary => summary.id === id);
        if (index < 0) {
            throw operationError(PlaylistErrorCode.LocalPlaylistNotFound, id);
        }
        return { index, summary: this.#summaries[index]! };
    }

    #replaceAt(
        index: number,
        summary: StoredPlaylistSummary,
    ): StoredPlaylistSummary[] {
        const next = this.#summaries.slice();
        next[index] = summary;
        return next;
    }

    /** 唯一新歌单 id：时钟隔离会话，计数器隔离同一会话，并与现有 id / favorite 去撞 */
    #freshId(): string {
        let id: string;
        do {
            idCounter += 1;
            id = `${Date.now().toString(36)}-${idCounter.toString(36)}`;
        } while (
            id === FAVORITE_PLAYLIST_ID ||
            this.#summaries.some(summary => summary.id === id)
        );
        return id;
    }

    /** 写 index → 更新镜像 → 发布；写盘失败以 PersistenceFailed reject，不更新内存不发布 */
    #commitSummaries(next: readonly StoredPlaylistSummary[]): void {
        try {
            writeIndex(this.#index, next);
        } catch {
            throw operationError(PlaylistErrorCode.PersistenceFailed);
        }
        this.#summaries = next;
        this.#publish();
    }

    /**
     * 原子恢复普通歌单：先纯计算目标态（校验/去重/计数都在 collection.add 内完成），
     * 再按「新用户 store → favorite store → index（提交点）」顺序写盘；任一步抛错则
     * best-effort 还原 favorite/index 原字节、清掉刚写的孤儿 store，整体 reject，不半提交
     */
    #restoreLocal(
        inputs: readonly DeepReadonly<LocalPlaylistTransferItem>[],
        mode: LocalPlaylistRestoreMode,
    ): LocalPlaylistRestoreResult {
        // degraded：append 拒绝（不能往不可信状态增量）；overwrite 放行（整体替换即恢复写）
        const wasDegraded = this.#status === 'degraded';
        if (mode === 'append') {
            this.#assertWritable();
            if (this.#favoriteCorrupt) {
                throw operationError(PlaylistErrorCode.StorageDegraded);
            }
        }
        const now = Date.now();
        const result: LocalPlaylistRestoreResult = {
            localPlaylistsCreated: 0,
            musicAdded: 0,
            musicDuplicatesSkipped: 0,
            invalidMusicSkipped: 0,
        };
        const tally = (added: AddMusicResult): void => {
            result.musicAdded += added.added;
            result.musicDuplicatesSkipped += added.duplicates;
            result.invalidMusicSkipped += added.invalid;
        };
        const musicOf = (
            input: DeepReadonly<LocalPlaylistTransferItem> | undefined,
        ): readonly MusicItem[] =>
            input ? (input.musicList as readonly MusicItem[]) : [];

        // 1. favorite 目标集合：overwrite 从空重建、append 从现有合并；备份曲目前插（最近加入在前）
        const favInput = inputs.find(
            input => input.id === FAVORITE_PLAYLIST_ID,
        );
        const favBase =
            mode === 'overwrite'
                ? MusicCollection.empty(
                      favInput?.sortMode ?? PlaylistMusicSortMode.Manual,
                  )
                : this.#favorite;
        const favAdd = favBase.add(musicOf(favInput), now);
        tally(favAdd.result);
        const favCollection = favAdd.collection;

        // 2. 新建普通歌单：备份数组序，各分新 id，曲目按输入序落库；展示 sortMode 沿用输入、缺省 manual（确定性，不随目标设备默认漂移）
        const created: {
            summary: StoredUserSummary;
            collection: MusicCollection;
        }[] = [];
        for (const input of inputs) {
            if (input.id === FAVORITE_PLAYLIST_ID) {
                continue;
            }
            const add = MusicCollection.empty(
                input.sortMode ?? PlaylistMusicSortMode.Manual,
            ).add(musicOf(input), now);
            tally(add.result);
            created.push({
                summary: {
                    id: this.#freshId(),
                    kind: 'user',
                    title: input.title,
                    description: input.description,
                    artwork: add.collection.latestArtwork,
                    hasCustomArtwork: false,
                    musicCount: add.collection.count,
                    createdAt: input.createdAt ?? now,
                },
                collection: add.collection,
            });
        }
        result.localPlaylistsCreated = created.length;

        // 3. 新 index：favorite 居首、新建块前插、现有普通歌单在后（overwrite 丢弃现有）
        const existingFav = this.#summaries.find(
            (summary): summary is StoredFavoriteSummary =>
                summary.kind === 'favorite',
        );
        // favorite 摘要：append 保留现有元数据（仅刷新计数/自动封面），overwrite 取备份元数据、弃自定义封面
        const favSummary: StoredFavoriteSummary =
            mode === 'append' && existingFav
                ? {
                      ...existingFav,
                      musicCount: favCollection.count,
                      artwork: existingFav.hasCustomArtwork
                          ? existingFav.artwork
                          : favCollection.latestArtwork,
                  }
                : {
                      id: FAVORITE_PLAYLIST_ID,
                      kind: 'favorite',
                      title: '',
                      description: favInput?.description,
                      artwork: favCollection.latestArtwork,
                      hasCustomArtwork: false,
                      musicCount: favCollection.count,
                      createdAt:
                          favInput?.createdAt ?? existingFav?.createdAt ?? now,
                  };
        const existingUsers =
            mode === 'append'
                ? this.#summaries.filter(summary => summary.kind === 'user')
                : [];
        const nextSummaries: StoredPlaylistSummary[] = [
            favSummary,
            ...created.map(entry => entry.summary),
            ...existingUsers,
        ];

        // 4. 捕获回滚 raw：favorite store 与 index 的原字节（损坏 raw 也原样留存）
        const favStore = getOrCreateMMKV(playlistStoreId(FAVORITE_PLAYLIST_ID));
        const rollbackFavData = favStore.getString(PLAYLIST_DATA_KEY);
        const rollbackFavSort = favStore.getString(PLAYLIST_SORT_KEY);
        const rollbackIndex = this.#index.getString(PLAYLIST_DATA_KEY);

        // 5. 写盘：新用户 store（孤儿、失败可弃）→ favorite store → index（提交点）；不碰 $version（迁移进度归迁移系统，restore 只摆歌单）
        try {
            for (const entry of created) {
                const store = getOrCreateMMKV(
                    playlistStoreId(entry.summary.id),
                );
                writeMusic(store, entry.collection.entries);
                writeSortMode(store, entry.collection.sortMode);
            }
            writeMusic(favStore, favCollection.entries);
            writeSortMode(favStore, favCollection.sortMode);
            writeIndex(this.#index, nextSummaries);
        } catch {
            restoreRawValue(favStore, PLAYLIST_DATA_KEY, rollbackFavData);
            restoreRawValue(favStore, PLAYLIST_SORT_KEY, rollbackFavSort);
            restoreRawValue(this.#index, PLAYLIST_DATA_KEY, rollbackIndex);
            for (const entry of created) {
                try {
                    getOrCreateMMKV(
                        playlistStoreId(entry.summary.id),
                    ).clearAll();
                } catch {
                    // best-effort：孤儿 store 清理失败无碍，index 未提交故不可达
                }
            }
            throw operationError(PlaylistErrorCode.PersistenceFailed);
        }

        // 6. 提交成功：overwrite 清掉被替换掉的旧普通歌单 store/详情，及旧 favorite 自定义封面文件
        const removedIds: string[] = [];
        if (mode === 'overwrite') {
            const kept = new Set(nextSummaries.map(summary => summary.id));
            for (const old of this.#summaries) {
                if (old.kind === 'user' && !kept.has(old.id)) {
                    removedIds.push(old.id);
                    cleanupRemoved(old);
                }
            }
            if (existingFav?.hasCustomArtwork && existingFav.artwork) {
                detach(removeArtwork(existingFav.artwork));
            }
        }

        // 7. 重置内存态 + 发布读模型（写成功即从 degraded 恢复 ready）
        this.#status = 'ready';
        this.#favoriteCorrupt = false;
        this.#favorite = favCollection;
        this.#summaries = nextSummaries;
        // overwrite 换掉全部普通歌单：清懒缓存；append 保留现有歌单缓存、只补新建（免详情读模型陈旧）
        if (mode === 'overwrite') {
            this.#loaded.clear();
        }
        for (const entry of created) {
            this.#loaded.set(entry.summary.id, entry.collection);
        }
        removeLoadedDetails(removedIds);
        this.#publishFavorite(favCollection);
        setLoadedDetail(
            FAVORITE_PLAYLIST_ID,
            this.#detailOf(FAVORITE_PLAYLIST_ID, favCollection),
        );
        this.#publish();
        // 从 degraded 恢复：setup 当时跳过了 starred 载入，补一次以免 ready 后误报空 starred
        // 恢复已提交，补载抛错不能让调用方误以为恢复失败：按损坏只读并留痕
        if (wasDegraded) {
            try {
                this.#loadStarred();
            } catch (error) {
                this.#starredCorrupt = true;
                this.#noteLocalDataIssue(
                    '恢复后 starred 装载抛错，按损坏只读',
                    error,
                );
            }
            this.#flushLocalDataIssues();
        }

        return result;
    }

    /**
     * 恢复 Starred playlists：coerceStarred 逐项基本校验（非法→跳过计数）、按 (platform,id) 去重，
     * append 前插 / overwrite 替换；单 store 一次原子写，写失败 PersistenceFailed（overwrite 顺带修复损坏）
     */
    #restoreStarred(
        inputs: readonly DeepReadonly<StarredPlaylistTransferItem>[],
        mode: StarredPlaylistRestoreMode,
    ): StarredPlaylistRestoreResult {
        // 恢复要求模块 ready；append 合并进现有 → 还需可信的 starred 底（损坏则拒），overwrite 整体替换可容忍损坏
        this.#assertWritable();
        if (mode === 'append' && this.#starredCorrupt) {
            throw operationError(PlaylistErrorCode.StorageDegraded);
        }
        const result: StarredPlaylistRestoreResult = {
            starredAdded: 0,
            starredSkipped: 0,
        };
        const seen = new Set<string>();
        if (mode === 'append') {
            for (const p of this.#starred) {
                seen.add(mediaKey(p));
            }
        }
        const added: StarredPlaylist[] = [];
        for (const input of inputs) {
            const clean = coerceStarred(input);
            if (!clean) {
                result.starredSkipped += 1;
                continue;
            }
            const key = mediaKey(clean);
            if (seen.has(key)) {
                // append 下已收藏，或输入批内重复：跳过（护住 starred 键唯一的不变量）
                result.starredSkipped += 1;
                continue;
            }
            seen.add(key);
            added.push(clean);
        }
        result.starredAdded = added.length;
        // append 且无新增：纯 no-op，免无谓写盘/发布（也避免磁盘异常把 no-op 误报 PersistenceFailed）
        if (mode === 'append' && added.length === 0) {
            return result;
        }
        // append 前插（最近加入在前）；overwrite 仅用输入
        const next = mode === 'append' ? [...added, ...this.#starred] : added;
        this.#commitStarred(next);
        // overwrite 重写 starred store 即修复其损坏（append 分支此前已保证不损坏）
        this.#starredCorrupt = false;
        return result;
    }

    #publish(): void {
        setPlaylistStatus(this.#status);
        setLocalPlaylists(this.#summaries.map(toLocalPlaylist));
    }

    /** eager 载 favorite 曲目；损坏或读盘异常则空集合 + 标记，护住可恢复 raw */
    #loadFavorite(): void {
        this.#favorite = this.#readFavoriteCollection();
        this.#publishFavorite(this.#favorite);
        setLoadedDetail(
            FAVORITE_PLAYLIST_ID,
            this.#detailOf(FAVORITE_PLAYLIST_ID, this.#favorite),
        );
    }

    #readFavoriteCollection(): MusicCollection {
        try {
            const store = getOrCreateMMKV(
                playlistStoreId(FAVORITE_PLAYLIST_ID),
            );
            const read = readMusic(store);
            if (read.status !== 'corrupt') {
                const entries = read.status === 'valid' ? read.value : [];
                return MusicCollection.from(entries, this.#sortModeOf(store));
            }
            this.#noteLocalDataIssue('favorite 曲目数据损坏，退为空集合只读');
        } catch (error) {
            // 读盘异常按损坏处理
            this.#noteLocalDataIssue(
                'favorite 曲目读取失败，退为空集合只读',
                error,
            );
        }
        this.#favoriteCorrupt = true;
        return MusicCollection.empty(this.#defaultSort());
    }

    /** eager 载 starred；损坏或读盘异常则标记、不发布（护住可恢复 raw） */
    #loadStarred(): void {
        const snapshot = this.#readStarred();
        if (snapshot) {
            this.#setStarred(snapshot);
        }
    }

    #readStarred(): readonly StarredPlaylist[] | undefined {
        try {
            const read = readStarred(this.#starredStore);
            if (read.status !== 'corrupt') {
                const list = read.status === 'valid' ? read.value : [];
                // 语义校验：本地平台不该出现在 starred、身份不得重复；违反视为损坏
                if (!hasStarredViolation(list)) {
                    return list;
                }
            }
            this.#noteLocalDataIssue('starred 数据损坏，未发布');
        } catch (error) {
            // 读盘异常按损坏处理
            this.#noteLocalDataIssue('starred 读取失败，未发布', error);
        }
        this.#starredCorrupt = true;
        return undefined;
    }

    /** 写 starred → 更新镜像 + 发布；写盘失败以 PersistenceFailed reject */
    #commitStarred(next: readonly StarredPlaylist[]): void {
        try {
            writeStarred(this.#starredStore, next);
        } catch {
            throw operationError(PlaylistErrorCode.PersistenceFailed);
        }
        this.#setStarred(next);
    }

    #setStarred(next: readonly StarredPlaylist[]): void {
        // 冻结发布快照：命令侧与 atom 共享引用也不会被外部原地改动；keys 另发独立 Set
        const frozen = deepFreeze(next);
        this.#starred = frozen;
        this.#starredKeys = starredKeysOf(frozen);
        setStarredPlaylists(frozen);
        setStarredKeys(new Set(this.#starredKeys));
    }

    /** starred 写前置：模块 degraded 或 starred 损坏都以 StorageDegraded reject */
    #assertStarredWritable(): void {
        this.#assertWritable();
        if (this.#starredCorrupt) {
            throw operationError(PlaylistErrorCode.StorageDegraded);
        }
    }

    /** 取歌单曲目集合：favorite 用常驻、其它命中缓存或懒读；曲目损坏/读盘异常抛错（局部化） */
    #collectionOf(id: string): MusicCollection {
        if (id === FAVORITE_PLAYLIST_ID) {
            return this.#favorite;
        }
        const cached = this.#loaded.get(id);
        if (cached) {
            return cached;
        }
        const collection = this.#readCollection(id);
        this.#loaded.set(id, collection);
        return collection;
    }

    #readCollection(id: string): MusicCollection {
        try {
            const store = getOrCreateMMKV(playlistStoreId(id));
            const read = readMusic(store);
            if (read.status !== 'corrupt') {
                const entries = read.status === 'valid' ? read.value : [];
                return MusicCollection.from(entries, this.#sortModeOf(store));
            }
        } catch {
            // 读盘异常 → 下方 PersistenceFailed
        }
        throw operationError(PlaylistErrorCode.PersistenceFailed, id);
    }

    /** 快照读集合：favorite 用常驻，其它复用缓存或不写 #loaded 地读（避免快照污染惰性缓存） */
    #snapshotCollection(id: string): MusicCollection {
        if (id === FAVORITE_PLAYLIST_ID) {
            return this.#favorite;
        }
        return this.#loaded.get(id) ?? this.#readCollection(id);
    }

    /** 音乐写入统一提交：音乐 store 权威先落 → 更新内存 → best-effort 刷摘要缓存 → 发布详情 */
    #commitMusic(id: string, next: MusicCollection): void {
        const store = getOrCreateMMKV(playlistStoreId(id));
        try {
            writeMusic(store, next.entries);
            // reorder 会切 Manual，须一并持久化排序模式，否则重启按旧模式重排、手动序丢失
            writeSortMode(store, next.sortMode);
        } catch {
            throw operationError(PlaylistErrorCode.PersistenceFailed);
        }
        this.#setCollection(id, next);
        this.#refreshSummary(id, next);
        setLoadedDetail(id, this.#detailOf(id, next));
    }

    /** 更新内存集合；favorite 另发布成员键集 */
    #setCollection(id: string, collection: MusicCollection): void {
        if (id === FAVORITE_PLAYLIST_ID) {
            this.#favorite = collection;
            this.#publishFavorite(collection);
        } else {
            this.#loaded.set(id, collection);
        }
    }

    /**
     * favorite 成员键集的唯一发布点：推 atom 镜像 + 通知非 React 订阅者。
     * 集合被重写即发（排序模式变化等成员未变的情况也会发），订阅者按幂等处理；
     * 逐个隔离异常，订阅者抛错不能中断其余订阅者与调用方正在执行的歌单命令
     */
    #publishFavorite(collection: MusicCollection): void {
        setFavoriteKeys(favoriteKeysOf(collection));
        this.#favoriteListeners.forEach(cb => {
            try {
                cb();
            } catch {
                // 订阅者自身的问题，不牵连歌单写入
            }
        });
    }

    /** best-effort 刷新摘要 musicCount + auto artwork（列表缓存）；失败留陈旧、下次音乐写自愈 */
    #refreshSummary(id: string, collection: MusicCollection): void {
        const index = this.#summaries.findIndex(s => s.id === id);
        if (index < 0) {
            return;
        }
        const summary = this.#summaries[index]!;
        const artwork = summary.hasCustomArtwork
            ? summary.artwork
            : collection.latestArtwork;
        if (
            summary.musicCount === collection.count &&
            summary.artwork === artwork
        ) {
            return;
        }
        const next = this.#replaceAt(index, {
            ...summary,
            musicCount: collection.count,
            artwork,
        });
        try {
            writeIndex(this.#index, next);
        } catch {
            // 摘要缓存写失败：陈旧，下次音乐写自愈
            return;
        }
        this.#summaries = next;
        this.#publish();
    }

    /** 组装公开详情快照；musicCount/artwork 从权威集合派生（不用可能陈旧的摘要缓存） */
    #detailOf(
        id: string,
        collection: MusicCollection,
        summary?: StoredPlaylistSummary,
    ): LocalPlaylistDetail {
        const found = summary ?? this.#summaries.find(s => s.id === id)!;
        return {
            ...toLocalPlaylist(found),
            musicCount: collection.count,
            artwork: found.hasCustomArtwork
                ? found.artwork
                : collection.latestArtwork,
            musicList: collection.musicList,
            sortMode: collection.sortMode,
        };
    }

    /** 已加载歌单改摘要字段后同步详情读模型；未加载不建详情 */
    #refreshDetail(id: string): void {
        const collection =
            id === FAVORITE_PLAYLIST_ID ? this.#favorite : this.#loaded.get(id);
        if (collection) {
            setLoadedDetail(id, this.#detailOf(id, collection));
        }
    }

    /** 已加载集合的自动封面 artwork（未加载返回 undefined，由后续音乐写自愈） */
    #loadedArtwork(id: string): string | undefined {
        const collection =
            id === FAVORITE_PLAYLIST_ID ? this.#favorite : this.#loaded.get(id);
        return collection?.latestArtwork;
    }

    #assertMusicWritable(id: string): void {
        this.#assertWritable();
        this.#locate(id);
        if (id === FAVORITE_PLAYLIST_ID && this.#favoriteCorrupt) {
            throw operationError(PlaylistErrorCode.StorageDegraded);
        }
    }

    /** 歌单排序模式：存储值优先，缺则取 config 默认 */
    #sortModeOf(store: MMKV): PlaylistMusicSortMode {
        return readSortMode(store) ?? this.#defaultSort();
    }

    /** config 的新建歌单默认排序；持久值可能是遗留/损坏值（get 不校验），故查表前先过 isValid */
    #defaultSort(): PlaylistMusicSortMode {
        try {
            const configured = this.#config.get(
                'playlist.defaultMusicSortMode',
            );
            return this.#config.isValid(
                'playlist.defaultMusicSortMode',
                configured,
            )
                ? CONFIG_SORT_MODE[configured]
                : PlaylistMusicSortMode.Manual;
        } catch {
            return PlaylistMusicSortMode.Manual;
        }
    }
}

/** 摘要 id 是否有重复（形状合法但语义损坏，视为 corrupt） */
function hasDuplicateIds(summaries: readonly StoredPlaylistSummary[]): boolean {
    const seen = new Set<string>();
    for (const summary of summaries) {
        if (seen.has(summary.id)) {
            return true;
        }
        seen.add(summary.id);
    }
    return false;
}

/** 保证 favorite 存在且居首；缺则新建，标题规范为空串（由 UI 本地化）；已规范且居首时免写盘 */
function ensureFavoriteFirst(
    summaries: readonly StoredPlaylistSummary[],
): readonly StoredPlaylistSummary[] {
    const index = summaries.findIndex(s => s.id === FAVORITE_PLAYLIST_ID);
    if (index < 0) {
        return [makeFavorite(), ...summaries];
    }
    const existing = summaries[index]!;
    // favorite 标题不落库、由 UI 按 kind 本地化；迁移/旧数据的标题一律规范为空串
    const favorite =
        existing.title === '' ? existing : { ...existing, title: '' };
    if (index === 0 && favorite === existing) {
        return summaries;
    }
    return [favorite, ...summaries.filter((_, i) => i !== index)];
}

/** 新建 favorite 摘要；title 留空由 UI 按 kind 本地化 */
function makeFavorite(): StoredFavoriteSummary {
    return {
        id: FAVORITE_PLAYLIST_ID,
        kind: 'favorite',
        title: '',
        hasCustomArtwork: false,
        musicCount: 0,
        createdAt: Date.now(),
    };
}

/** 存储摘要 → 公开 LocalPlaylist（补 platform，按 kind 分派判别联合） */
function toLocalPlaylist(summary: StoredPlaylistSummary): LocalPlaylist {
    const base: Omit<UserLocalPlaylist, 'id' | 'kind'> = {
        platform: LOCAL_MEDIA_PLATFORM,
        title: summary.title,
        artwork: summary.artwork,
        description: summary.description,
        musicCount: summary.musicCount,
        createdAt: summary.createdAt,
        hasCustomArtwork: summary.hasCustomArtwork,
    };
    return summary.kind === 'favorite'
        ? { ...base, id: FAVORITE_PLAYLIST_ID, kind: 'favorite' }
        : { ...base, id: summary.id, kind: 'user' };
}

/** 删歌单后 best-effort 清理其音乐 store 与自定义封面文件 */
function cleanupRemoved(summary: StoredPlaylistSummary): void {
    try {
        getOrCreateMMKV(playlistStoreId(summary.id)).clearAll();
    } catch {
        // best-effort：清理失败不回滚已提交的删除
    }
    if (summary.hasCustomArtwork && summary.artwork) {
        detach(removeArtwork(summary.artwork));
    }
}

/** 回滚辅助：把 MMKV key 还原为捕获的原字节；原本不存在则删除 */
function restoreRawValue(
    store: MMKV,
    key: string,
    raw: string | undefined,
): void {
    try {
        if (raw === undefined) {
            store.remove(key);
        } else {
            store.set(key, raw);
        }
    } catch {
        // best-effort：回滚本身失败已无从补救
    }
}

/** 构造带稳定 code 的领域错误，供 IPlaylist 命令 reject */
function operationError(
    code: PlaylistErrorCode,
    message?: string,
): PlaylistOperationError {
    return Object.assign(new Error(message ?? code), {
        code,
    }) as PlaylistOperationError;
}

/** 单项或数组入参归一为数组 */
function normalizeItems(
    items: MusicItem | readonly MusicItem[],
): readonly MusicItem[] {
    return ([] as MusicItem[]).concat(items);
}

function normalizeRefs(
    refs: MediaRef | readonly MediaRef[],
): readonly MediaRef[] {
    return ([] as MediaRef[]).concat(refs);
}

/** 集合的 platform+id 键集，供 favoriteKeysAtom 发布 */
function favoriteKeysOf(collection: MusicCollection): ReadonlySet<string> {
    return collection.keys;
}

/** starred 列表的 platform+id 键集，供 O(1) isPlaylistStarred 与 starredKeysAtom 发布 */
function starredKeysOf(list: readonly StarredPlaylist[]): ReadonlySet<string> {
    return new Set(list.map(p => mediaKey(p)));
}

/** starred 语义违规：含本地平台项（应属 Local 域），或身份（platform+id）重复 */
function hasStarredViolation(list: readonly StarredPlaylist[]): boolean {
    const seen = new Set<string>();
    for (const p of list) {
        if (isLocalPlatform(p.platform)) {
            return true;
        }
        const key = mediaKey(p);
        if (seen.has(key)) {
            return true;
        }
        seen.add(key);
    }
    return false;
}

/** 递归冻结已发布快照：starred 存任意插件对象，冻结后命令侧与发布侧共享引用也不会被外部原地改动 */
function deepFreeze<T>(value: T): T {
    if (
        typeof value === 'object' &&
        value !== null &&
        !Object.isFrozen(value)
    ) {
        Object.freeze(value);
        for (const key of Object.keys(value)) {
            deepFreeze((value as Record<string, unknown>)[key]);
        }
    }
    return value;
}

/** 校验 + 深拷贝收藏输入为自有快照；不可序列化或缺 platform·id 返回 null（数字 id 归一为字符串） */
function coerceStarred(item: PlaylistItemBase): StarredPlaylist | null {
    const copy = safeParse<Record<string, unknown>>(safeStringify(item));
    if (!copy || typeof copy !== 'object' || Array.isArray(copy)) {
        return null;
    }
    // starred 只收远程歌单：本地平台不允许（与 Local 域互斥）
    if (
        typeof copy.platform !== 'string' ||
        copy.platform.length === 0 ||
        isLocalPlatform(copy.platform)
    ) {
        return null;
    }
    const id = copy.id;
    if (typeof id === 'number' && Number.isFinite(id)) {
        copy.id = String(id);
    } else if (typeof id !== 'string' || id.length === 0) {
        return null;
    }
    return copy as StarredPlaylist;
}

/** 校验 order 是当前 starred 的排列（无重复、完整覆盖）并按其重排；否则抛 InvalidStarredPlaylistOrder */
function reorderStarred(
    current: readonly StarredPlaylist[],
    order: readonly MediaRef[],
): readonly StarredPlaylist[] {
    if (order.length !== current.length) {
        throw operationError(PlaylistErrorCode.InvalidStarredPlaylistOrder);
    }
    const byKey = new Map(current.map(p => [mediaKey(p), p] as const));
    const seen = new Set<string>();
    const reordered: StarredPlaylist[] = [];
    for (const ref of order) {
        const key = mediaKey(ref);
        const found = byKey.get(key);
        if (seen.has(key) || !found) {
            throw operationError(PlaylistErrorCode.InvalidStarredPlaylistOrder);
        }
        seen.add(key);
        reordered.push(found);
    }
    return reordered;
}

/** 裸对象 live-binding；UX / core 通过此对象读写，由 app/container 装配 */
export let playlist: IPlaylist;

/** 仅供 app/container 调用：装配 playlist 单例 */
export function providePlaylist(instance: IPlaylist): void {
    playlist = instance;
}

export {
    useIsFavorite,
    useIsPlaylistStarred,
    useLoadedPlaylistDetail,
    useLocalPlaylists,
    usePlaylistStatus,
    useStarredPlaylists,
} from './hooks';
export {
    FAVORITE_PLAYLIST_ID,
    LOCAL_PLAYLIST_DESCRIPTION_MAX_LENGTH,
    LOCAL_PLAYLIST_TITLE_MAX_LENGTH,
    PlaylistErrorCode,
    PlaylistMusicSortMode,
} from './types';
export type {
    AddMusicResult,
    CreateLocalPlaylistInput,
    FavoritePlaylist,
    IPlaylist,
    ILocalPlaylistTransfer,
    IStarredTransfer,
    LocalPlaylist,
    LocalPlaylistDetail,
    LocalPlaylistRestoreMode,
    LocalPlaylistRestoreResult,
    LocalPlaylistTransferItem,
    PlaylistDeps,
    PlaylistOperationError,
    PlaylistStatus,
    RemoveLocalPlaylistsResult,
    RemoveMusicResult,
    StarredPlaylist,
    StarredPlaylistRestoreMode,
    StarredPlaylistRestoreResult,
    StarredPlaylistTransferItem,
    UpdateLocalPlaylistPatch,
    UserLocalPlaylist,
} from './types';
