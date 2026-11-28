import { useCallback, useSyncExternalStore } from 'react';

import {
    getObject,
    getOrCreateMMKV,
    listMMKVIds,
    setObject,
} from '@/infra/storage';
import { isRecord } from '@/utils/guards';
import { isQualityKey } from '@/utils/media';
import { isSameFilePath } from '@/utils/path';

import type { LyricOverride, MediaRef, MusicItem, QualityKey } from '@/types';

/**
 * 媒体富元数据端口：按 MediaRef 索引读写单独存储的媒体富信息（下载、本地路径、歌词偏移、歌词来源）
 * 信息存于 side-table，绝不 mutate 到 DTO 上
 */
export interface IMediaMeta {
    /**
     * 已记录的本地文件候选：下载在前、扫描在后，同路径去重；无记录返回空数组
     * 下载候选带实际音质，扫描候选不带；只读记录，不检查文件存在性
     * 返回原始路径的新快照；文件探测与 file:// URI 编码由调用方负责
     */
    getLocalFiles(
        ref: MediaRef,
    ): readonly { path: string; quality?: QualityKey }[];
    /**
     * 该身份在设备上有没有文件（扫描来的与下载来的都算）
     *
     * UI 判断「能不能删文件」「要不要标已下载」都问它，**不要拿 `platform` 倒推**——
     * 下载来的歌身份是插件，按身份判会得出「不在设备上」的错误结论
     *
     * 返回的是**锚点的说法**，未经复核：用户在文件管理器里删掉文件时记录会悬空
     * （设计 §6.1 不做对账），此时它仍为 true。渲染期本也无法同步 stat，
     * 真读不到时按 §7.2 优雅降级（显示「文件缺失」、点播自动联网回退）
     */
    hasLocalFile(ref: MediaRef): boolean;
    /** 写入本地原文件路径（裸路径，写 localPath；与 legacy 同字段）；合并记录并保留其它字段 */
    setLocalPath(ref: MediaRef, path: string): void;
    /**
     * 某个文件已被删除 → 清掉该 ref 中**指向它**的本地文件记录（downloadData / localPath 各自比对）
     * 必须按 path 比对：同一首歌可能有多份文件，无条件清会把仍存活那份的锚点一并抹掉
     */
    clearLocalFile(ref: MediaRef, path: string): void;
    /** 写入已下载文件信息（裸路径 + 实际音质，写 downloadData）；完成入账时调，getLocalFiles 将它列在首位 */
    setDownloadData(
        ref: MediaRef,
        data: { path: string; quality: QualityKey },
    ): void;
    /**
     * 手动歌词时间轴偏移（秒）；未设置或非法时返回 0
     * 正值表示歌词提前，负值表示歌词延迟；与 legacy MediaExtra.lyricOffset 含义和单位相同
     */
    getLyricOffset(ref: MediaRef): number;
    /** 写入手动歌词时间轴偏移（秒）；合并记录并保留同一记录中的其他字段 */
    setLyricOffset(ref: MediaRef, seconds: number): void;
    /** 读取用户指定的歌词来源；未指定返回 undefined */
    getLyricOverride(ref: MediaRef): LyricOverride | undefined;
    /** 写入用户指定的歌词来源（合并保留其它字段）；返回是否落库（ref 无效 / 形状非法 / 序列化失败返 false） */
    setLyricOverride(ref: MediaRef, override: LyricOverride): boolean;
    /** 清除用户指定的歌词来源（恢复默认歌词）；保留 downloadData/lyricOffset 等其它字段 */
    clearLyricOverride(ref: MediaRef): void;
}

/**
 * mediaMeta 传输项（跨端 wire）：只含用户决定
 * 字段名 associatedLyric 是与桌面版对接的冻结契约，不随本地存储改名；本地的
 * `lyricOverride` 由 snapshot / restore 在此双向转换
 * 手工编辑的词（kind: 'custom'）没有对应 wire 字段，故天然不进备份——它的文本
 * 不可再生，跨设备只能靠系统级备份（iOS 的 custom/ 目录刻意留在备份内）
 */
export interface MediaMetaTransferItem {
    readonly platform: string;
    readonly id: string;
    readonly lyricOffset?: number;
    readonly associatedLyric?: { readonly musicItem: MusicItem };
}

/** restoreMediaMeta 逐类结果计数 */
export interface MediaMetaRestoreResult {
    /** 写入（新增或字段并集更新）的记录数 */
    upserted: number;
    /** 跳过的记录数（无纳入字段 / ref 非法 / 序列化失败） */
    skipped: number;
}

/**
 * 供 core/backup 使用的平台发现、快照与字段并集恢复能力
 * 本地曲 installationId 门控归 core/backup
 */
export interface IMediaMetaTransfer {
    /** 合并平台目录、可识别旧存储与调用方线索；历史哈希文件仍需原始平台名 */
    listPlatforms(knownPlatforms: readonly string[]): Promise<string[]>;
    /** 快照给定平台的 mediaMeta：只输出含纳入字段的记录，剥掉可再生缓存 */
    snapshotMediaMeta(platforms: readonly string[]): MediaMetaTransferItem[];
    /** 逐条字段级并集 upsert：保留目标端 downloadData / localPath，不碰 $version */
    restoreMediaMeta(
        items: readonly MediaMetaTransferItem[],
    ): MediaMetaRestoreResult;
}

/** 每个插件使用一个 MMKV store，沿用 legacy `MediaExtra.<platform>` 持久化契约，无需迁移已有数据 */
const MEDIA_EXTRA_STORE_PREFIX = 'MediaExtra.';
const PLATFORM_DIRECTORY_STORE = 'music.MediaMeta';

function rememberPlatforms(platforms: readonly string[]): string[] {
    const store = getOrCreateMMKV(PLATFORM_DIRECTORY_STORE);
    const stored = getObject<unknown>(store, 'platforms');
    if (
        store.getString('platforms') !== undefined &&
        (!Array.isArray(stored) || !stored.every(isNonEmptyString))
    ) {
        throw new Error('Invalid media platform directory');
    }
    const current = (stored ?? []) as string[];
    const next = [
        ...new Set([...current, ...platforms.filter(isNonEmptyString)]),
    ];
    if (
        next.length !== current.length &&
        !setObject(store, 'platforms', next)
    ) {
        throw new Error('Unable to save media platform directory');
    }
    return next;
}

/**
 * 持久化的媒体富信息；沿用 legacy 的 downloadData / localPath / lyricOffset 冻结字段名，无需迁移
 * lyricOverride 是本轮新增的本地字段（legacy 无对应），只在本机使用、不参与跨端 wire
 * 本地扫描写 localPath（与 legacy 同字段）；下载路径走 downloadData.path，读取时下载优先
 */
interface StoredMediaMeta {
    /** 下载信息（结构对齐跨端共享的 MediaMeta 契约）；读路径优先于 localPath */
    downloadData?: { path?: string; quality?: QualityKey };
    /** 本地原文件路径（本地音乐扫描写入）；legacy 也用此字段存本地/下载路径，作为下载路径之后的候选 */
    localPath?: string;
    /** 手动歌词时间轴偏移（秒），沿用 legacy 冻结字段名 */
    lyricOffset?: number;
    /** 用户指定的歌词来源（关联 / 手工编辑）；文本不在这里，见 core/lyric 的 fileStore */
    lyricOverride?: LyricOverride;
}

/** 持久化数据可被篡改 / 跨版本漂移，读回的来源记录必须逐形状校验 */
function isLyricOverride(value: unknown): value is LyricOverride {
    if (!isRecord(value)) {
        return false;
    }
    if (value.kind === 'custom') {
        return true;
    }
    return (
        value.kind === 'associated' &&
        isRecord(value.musicItem) &&
        isNonEmptyString(value.musicItem.platform) &&
        isNonEmptyString(value.musicItem.id)
    );
}

/** 非空字符串；持久化数据可被篡改 / 跨版本漂移，类型不能当真 */
function isNonEmptyString(value: unknown): value is string {
    return typeof value === 'string' && value.length > 0;
}

/**
 * 记录里有没有指向本机文件的路径（下载来的与扫描来的都算）
 * 命令式的 `hasLocalFile` 与响应式的 `useHasLocalFile` 共用它，否则两条路的判据会漂移
 */
function hasStoredFile(stored: StoredMediaMeta | undefined): boolean {
    return (
        isNonEmptyString(stored?.downloadData?.path) ||
        isNonEmptyString(stored?.localPath)
    );
}

/**
 * 按 platform 取 store、按 id 读原始记录；ref 无效或解析失败返回 undefined
 * 持久化数据是系统边界：单条损坏只当没读到，不得把异常抛给调用方（渲染期报错会整列表白屏）
 */
function readStoredMeta(ref: MediaRef): StoredMediaMeta | undefined {
    if (!ref.platform || !ref.id) {
        return undefined;
    }
    try {
        return getObject<StoredMediaMeta>(
            getOrCreateMMKV(`${MEDIA_EXTRA_STORE_PREFIX}${ref.platform}`),
            ref.id,
        );
    } catch {
        return undefined;
    }
}

/**
 * 订阅者表：storeId → key → 回调集
 * **每个 store 只挂一个原生监听**，再按 key 分发。换成每个订阅者各挂一个的话，
 * 重扫期间逐文件写 localPath 会把回调量放大成「写入数 × 挂载行数」
 */
const metaWatchers = new Map<string, Map<string, Set<() => void>>>();

/** 订阅某条记录的变更；返回退订函数 */
function watchStoredMeta(ref: MediaRef, onChange: () => void): () => void {
    const storeId = `${MEDIA_EXTRA_STORE_PREFIX}${ref.platform}`;
    let byKey = metaWatchers.get(storeId);
    if (!byKey) {
        byKey = new Map();
        metaWatchers.set(storeId, byKey);
        // 监听与 store 同生命周期，不退订：store 数量等于插件数，有界
        const listenTo = byKey;
        getOrCreateMMKV(storeId).addOnValueChangedListener(key => {
            for (const cb of listenTo.get(key) ?? []) {
                cb();
            }
        });
    }
    const key = String(ref.id);
    let subscribers = byKey.get(key);
    if (!subscribers) {
        subscribers = new Set();
        byKey.set(key, subscribers);
    }
    subscribers.add(onChange);
    return () => {
        subscribers.delete(onChange);
        if (subscribers.size === 0) {
            byKey.delete(key);
        }
    };
}

/** 媒体富信息实现：按 platform 划分 store、按 id 读写，并兼容 legacy schema */
export class MediaMeta implements IMediaMeta, IMediaMetaTransfer {
    getLocalFiles(
        ref: MediaRef,
    ): readonly { path: string; quality?: QualityKey }[] {
        const stored = this.#read(ref);
        const files: { path: string; quality?: QualityKey }[] = [];
        const download = stored?.downloadData;
        if (isNonEmptyString(download?.path)) {
            files.push({
                path: download.path,
                // 音质是下载时记下的实际命中档；持久化数据可被篡改 / 跨版本漂移，非法值当未知
                ...(isQualityKey(download.quality)
                    ? { quality: download.quality }
                    : {}),
            });
        }
        // 扫描来的本地文件没有音质档概念，故不带 quality
        if (
            isNonEmptyString(stored?.localPath) &&
            stored.localPath !== download?.path
        ) {
            files.push({ path: stored.localPath });
        }
        return files;
    }

    /** 锚点的说法，未经复核（见端口注释） */
    hasLocalFile(ref: MediaRef): boolean {
        return hasStoredFile(this.#read(ref));
    }

    setLocalPath(ref: MediaRef, path: string): void {
        if (!ref.platform || !ref.id || !path) {
            return;
        }
        const store = getOrCreateMMKV(
            `${MEDIA_EXTRA_STORE_PREFIX}${ref.platform}`,
        );
        // read-modify-write 合并，保留 lyricOffset 等其它字段
        const stored = getObject<StoredMediaMeta>(store, ref.id) ?? {};
        setObject(store, ref.id, { ...stored, localPath: path });
    }

    clearLocalFile(ref: MediaRef, path: string): void {
        if (!ref.platform || !ref.id || !path) {
            return;
        }
        const store = getOrCreateMMKV(
            `${MEDIA_EXTRA_STORE_PREFIX}${ref.platform}`,
        );
        const stored = getObject<StoredMediaMeta>(store, ref.id);
        if (!stored) {
            return;
        }
        const next = { ...stored };
        let changed = false;
        if (
            isNonEmptyString(next.downloadData?.path) &&
            isSameFilePath(next.downloadData.path, path)
        ) {
            delete next.downloadData;
            changed = true;
        }
        if (
            isNonEmptyString(next.localPath) &&
            isSameFilePath(next.localPath, path)
        ) {
            delete next.localPath;
            changed = true;
        }
        if (changed) {
            setObject(store, ref.id, next);
        }
    }

    setDownloadData(
        ref: MediaRef,
        data: { path: string; quality: QualityKey },
    ): void {
        if (!ref.platform || !ref.id || !data.path) {
            return;
        }
        const store = getOrCreateMMKV(
            `${MEDIA_EXTRA_STORE_PREFIX}${ref.platform}`,
        );
        // read-modify-write 合并，保留 localPath / lyricOffset 等其它字段
        const stored = getObject<StoredMediaMeta>(store, ref.id) ?? {};
        setObject(store, ref.id, {
            ...stored,
            downloadData: { path: data.path, quality: data.quality },
        });
    }

    getLyricOffset(ref: MediaRef): number {
        const offset = this.#read(ref)?.lyricOffset;
        return typeof offset === 'number' && Number.isFinite(offset)
            ? offset
            : 0;
    }

    setLyricOffset(ref: MediaRef, seconds: number): void {
        if (!ref.platform || !ref.id || !Number.isFinite(seconds)) {
            return;
        }
        rememberPlatforms([ref.platform]);
        const store = getOrCreateMMKV(
            `${MEDIA_EXTRA_STORE_PREFIX}${ref.platform}`,
        );
        // read-modify-write 合并更新，保留 downloadData、localPath 等其它字段
        const stored = getObject<StoredMediaMeta>(store, ref.id) ?? {};
        setObject(store, ref.id, { ...stored, lyricOffset: seconds });
    }

    getLyricOverride(ref: MediaRef): LyricOverride | undefined {
        const stored = this.#read(ref)?.lyricOverride;
        return isLyricOverride(stored) ? stored : undefined;
    }

    setLyricOverride(ref: MediaRef, override: LyricOverride): boolean {
        if (!ref.platform || !ref.id || !isLyricOverride(override)) {
            return false;
        }
        rememberPlatforms([ref.platform]);
        const store = getOrCreateMMKV(
            `${MEDIA_EXTRA_STORE_PREFIX}${ref.platform}`,
        );
        // read-modify-write 合并，保留 lyricOffset 等其它字段
        const stored = getObject<StoredMediaMeta>(store, ref.id) ?? {};
        // 关联来源内嵌插件 DTO（不可信输入），序列化失败会跳过写入；回传落库结果供上层区分误报成功
        return setObject(store, ref.id, { ...stored, lyricOverride: override });
    }

    clearLyricOverride(ref: MediaRef): void {
        if (!ref.platform || !ref.id) {
            return;
        }
        const store = getOrCreateMMKV(
            `${MEDIA_EXTRA_STORE_PREFIX}${ref.platform}`,
        );
        const stored = getObject<StoredMediaMeta>(store, ref.id);
        if (!stored || stored.lyricOverride === undefined) {
            return;
        }
        // 只清 lyricOverride，保留 downloadData / localPath / lyricOffset 等
        const next = { ...stored };
        delete next.lyricOverride;
        setObject(store, ref.id, next);
    }

    // —— 备份传输 ——

    async listPlatforms(knownPlatforms: readonly string[]): Promise<string[]> {
        const ids = await listMMKVIds();
        return rememberPlatforms([
            ...knownPlatforms,
            ...ids
                .filter(id => id.startsWith(MEDIA_EXTRA_STORE_PREFIX))
                .map(id => id.slice(MEDIA_EXTRA_STORE_PREFIX.length)),
        ]);
    }

    snapshotMediaMeta(platforms: readonly string[]): MediaMetaTransferItem[] {
        const items: MediaMetaTransferItem[] = [];
        for (const platform of platforms) {
            if (!platform) {
                continue;
            }
            try {
                const store = getOrCreateMMKV(
                    `${MEDIA_EXTRA_STORE_PREFIX}${platform}`,
                );
                for (const id of store.getAllKeys()) {
                    // 跳过 $version 等保留键
                    if (id.startsWith('$')) {
                        continue;
                    }
                    const stored = getObject<StoredMediaMeta>(store, id);
                    if (!stored) {
                        continue;
                    }
                    const lyricOffset =
                        typeof stored.lyricOffset === 'number' &&
                        Number.isFinite(stored.lyricOffset)
                            ? stored.lyricOffset
                            : undefined;
                    // 只有关联有 wire 表示；手工编辑的词不可再生、也没有对应字段，故不进备份
                    const override = stored.lyricOverride;
                    const musicItem =
                        isLyricOverride(override) &&
                        override.kind === 'associated'
                            ? override.musicItem
                            : undefined;
                    // 只输出至少含一个纳入字段的记录；剥 downloadData/localPath
                    if (lyricOffset === undefined && !musicItem) {
                        continue;
                    }
                    items.push({
                        platform,
                        id,
                        ...(lyricOffset !== undefined ? { lyricOffset } : {}),
                        ...(musicItem
                            ? { associatedLyric: { musicItem } }
                            : {}),
                    });
                }
            } catch {
                // best-effort：单平台读失败跳过，继续其余平台
            }
        }
        return items;
    }

    restoreMediaMeta(
        items: readonly MediaMetaTransferItem[],
    ): MediaMetaRestoreResult {
        rememberPlatforms(
            items
                .filter(
                    item =>
                        item.platform && item.id && !item.id.startsWith('$'),
                )
                .map(item => item.platform),
        );
        let upserted = 0;
        let skipped = 0;
        for (const item of items) {
            const lyricOffset =
                typeof item.lyricOffset === 'number' &&
                Number.isFinite(item.lyricOffset)
                    ? item.lyricOffset
                    : undefined;
            const musicItem = item.associatedLyric?.musicItem;
            // ref 非法（缺 platform/id，或 id 撞 $ 保留键如 $version）/ 无纳入字段 → 跳过
            if (
                !item.platform ||
                !item.id ||
                item.id.startsWith('$') ||
                (lyricOffset === undefined && !musicItem)
            ) {
                skipped += 1;
                continue;
            }
            const store = getOrCreateMMKV(
                `${MEDIA_EXTRA_STORE_PREFIX}${item.platform}`,
            );
            // read-modify-write 字段并集：保留 downloadData / localPath 等目标端现有字段
            const stored = getObject<StoredMediaMeta>(store, item.id) ?? {};
            const next: StoredMediaMeta = { ...stored };
            if (lyricOffset !== undefined) {
                next.lyricOffset = lyricOffset;
            }
            // wire 只带得动关联；恢复成本地的 lyricOverride，文本留给取词时按 musicItem 重新拉
            if (musicItem) {
                next.lyricOverride = { kind: 'associated', musicItem };
            }
            // 内嵌不可信 DTO，序列化失败 → 计 skipped，不阻断其余（best-effort）
            if (setObject(store, item.id, next)) {
                upserted += 1;
            } else {
                skipped += 1;
            }
        }
        return { upserted, skipped };
    }

    /** 按 platform 获取 store、按 id 读取原始记录；ref 无效或解析失败时返回 undefined */
    #read(ref: MediaRef): StoredMediaMeta | undefined {
        return readStoredMeta(ref);
    }
}

/** 裸对象 live-binding，core/player 通过此对象读取；由 app/container 装配 */
export let mediaMeta: IMediaMeta;

/** 仅由 app/container 调用，用于装配 mediaMeta 单例 */
export function provideMediaMeta(instance: IMediaMeta): void {
    mediaMeta = instance;
}

/**
 * 该身份在设备上有没有文件（响应式）；命令式版本见 `IMediaMeta.hasLocalFile`
 *
 * 走「持久化 · 定键」（规范 §4.5 flavor 2）：每行的 key 在渲染时就知道，直接盯自己那一条。
 * 不为一个布尔值镜像整库——mediaMeta 里每首放过的歌都有记录，代价与收益不成比
 *
 * 不用 `useMMKVObject`：它每个 hook 实例各挂一个原生监听，且内部直接 `JSON.parse`，
 * 单条损坏会在渲染期抛错。这里走共享监听 + 容错读取，与命令式路径同一套守卫
 */
export function useHasLocalFile(ref: MediaRef): boolean {
    const { platform, id } = ref;
    const subscribe = useCallback(
        (onChange: () => void) =>
            platform && id
                ? watchStoredMeta({ platform, id }, onChange)
                : () => undefined, // ref 不合法：没什么可盯的，也不建无意义的订阅
        [platform, id],
    );
    const getSnapshot = useCallback(
        () => hasStoredFile(readStoredMeta({ platform, id })),
        [platform, id],
    );
    return useSyncExternalStore(subscribe, getSnapshot);
}
