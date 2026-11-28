/**
 * 单个 Local 歌单的音乐集合：去重 + 按 sortMode 排序 + 手动重排 + 最近加入封面派生
 * 不可变：变更方法返回新实例，便于调用方在持久化成功后再发布新状态
 * entries 恒为 manual 顺序（持久化用）；addedAt/batchRank 是加入时的不可变事实，供加入时间排序与封面派生
 */
import { coerceMusicItem, mediaKey } from '@/utils/media';

import { PlaylistMusicSortMode } from './types';

import type { PlaylistMusicEntry } from './storage';
import type { AddMusicResult, RemoveMusicResult } from './types';
import type { MediaRef, MusicItem } from '@/types';

export class MusicCollection {
    readonly sortMode: PlaylistMusicSortMode;
    /** manual 顺序的成员元数据，持久化用 */
    readonly entries: readonly PlaylistMusicEntry[];
    /** platform+id 键集，使 has() 为 O(1) */
    readonly #keySet: ReadonlySet<string>;
    /** 排序展示列表的惰性缓存：首次读 musicList 才排序，至多算一次 */
    #sortedCache: readonly MusicItem[] | undefined;

    /**
     * keySet 可由调用方按成员移交免逐次全量重算：add 累积集 / remove 裁剪集 / reorder·withSortMode 复用父集 / from 移交去重集
     * 未传时才从 entries 现算，当前仅 empty 空集走此回退；构造后绝不可变，故跨实例复用同一引用安全
     */
    private constructor(
        entries: readonly PlaylistMusicEntry[],
        sortMode: PlaylistMusicSortMode,
        keySet?: ReadonlySet<string>,
    ) {
        this.entries = entries;
        this.sortMode = sortMode;
        this.#keySet =
            keySet ?? new Set(entries.map(entry => mediaKey(entry.item)));
    }

    /** 按 sortMode 排序后的展示列表；惰性计算并缓存 */
    get musicList(): readonly MusicItem[] {
        return (this.#sortedCache ??= sortEntries(this.entries, this.sortMode));
    }

    /** platform+id 成员键集（只读）；供 favorite O(1) 判定与响应式发布复用，免重建 */
    get keys(): ReadonlySet<string> {
        return this.#keySet;
    }

    /**
     * 从持久化 entries（manual 顺序）+ 排序模式构造
     * 去重保首条：既建立成员唯一性不变量（remove/reorder 依赖），又取得自有数组、不持有外部引用
     */
    static from(
        entries: readonly PlaylistMusicEntry[],
        sortMode: PlaylistMusicSortMode,
    ): MusicCollection {
        const { entries: unique, keys } = dedupeByKey(entries);
        return new MusicCollection(unique, sortMode, keys);
    }

    /** 空集合 */
    static empty(sortMode: PlaylistMusicSortMode): MusicCollection {
        return new MusicCollection([], sortMode);
    }

    get count(): number {
        return this.entries.length;
    }

    /** 自动封面：按加入全序取最近加入且有封面那首的 artwork（与排序无关）；都无封面则 undefined */
    get latestArtwork(): string | undefined {
        let latest: PlaylistMusicEntry | undefined;
        // entries 是 manual 序（可被 reorder 打乱）、非加入序，故须全遍历取加入序最大的有封面者，不能找到即 break
        for (const entry of this.entries) {
            // 非字符串或纯空白封面视为无封面，不改写歌曲原字段。
            if (
                typeof entry.item.artwork === 'string' &&
                entry.item.artwork.trim() &&
                (latest === undefined || compareAddedOrder(entry, latest) > 0)
            ) {
                latest = entry;
            }
        }
        return latest?.item.artwork;
    }

    has(ref: MediaRef): boolean {
        return this.#keySet.has(mediaKey(ref));
    }

    /**
     * 插入一批音乐到 manual 开头（最近加入在前）；按 platform+id 对已存在与批内去重、保首条
     * 非法项（无 platform+id）计入 invalid；addedAt 用入参，batchRank 为批内 0..k
     */
    add(
        items: readonly MusicItem[],
        addedAt: number,
    ): { collection: MusicCollection; result: AddMusicResult } {
        const seen = new Set(this.#keySet);
        const addedEntries: PlaylistMusicEntry[] = [];
        let duplicates = 0;
        let invalid = 0;
        for (const raw of items) {
            const item = coerceMusicItem(raw);
            if (!item) {
                invalid += 1;
                continue;
            }
            const key = mediaKey(item);
            if (seen.has(key)) {
                duplicates += 1;
                continue;
            }
            seen.add(key);
            addedEntries.push({
                item,
                addedAt,
                batchRank: addedEntries.length,
            });
        }
        const result: AddMusicResult = {
            added: addedEntries.length,
            duplicates,
            invalid,
        };
        if (addedEntries.length === 0) {
            return { collection: this, result };
        }
        // seen 此刻恰为「旧键 ∪ 新增键」= 新集合成员键，直接移交省去重算
        const next = new MusicCollection(
            [...addedEntries, ...this.entries],
            this.sortMode,
            seen,
        );
        return { collection: next, result };
    }

    /** 按 platform+id 移除；removed=删除条数，missing=未命中的去重 ref 数，保余下 manual 序 */
    remove(refs: readonly MediaRef[]): {
        collection: MusicCollection;
        result: RemoveMusicResult;
    } {
        const targets = new Set(refs.map(mediaKey));
        const kept = this.entries.filter(
            entry => !targets.has(mediaKey(entry.item)),
        );
        const removed = this.entries.length - kept.length;
        // entries 键唯一，每个 target 至多命中一条；未命中的 target 计 missing
        const missing = targets.size - removed;
        const result: RemoveMusicResult = { removed, missing };
        if (removed === 0) {
            return { collection: this, result };
        }
        // 从旧键集裁掉命中键（未命中的 delete 为 no-op）即得保留项键集，省对 kept 重算
        const nextKeys = new Set(this.#keySet);
        for (const key of targets) {
            nextKeys.delete(key);
        }
        return {
            collection: new MusicCollection(kept, this.sortMode, nextKeys),
            result,
        };
    }

    /** 清空全部音乐 */
    clear(): { collection: MusicCollection; removed: number } {
        if (this.entries.length === 0) {
            return { collection: this, removed: 0 };
        }
        return {
            collection: MusicCollection.empty(this.sortMode),
            removed: this.entries.length,
        };
    }

    /**
     * 手动重排为 order 指定顺序并切 Manual；order 必须是当前全部项的精确排列
     * 非法（长度不符 / 重复 / 未知 ref）返回 null
     */
    reorder(order: readonly MediaRef[]): MusicCollection | null {
        if (order.length !== this.entries.length) {
            return null;
        }
        const byKey = new Map(
            this.entries.map(entry => [mediaKey(entry.item), entry]),
        );
        const reordered: PlaylistMusicEntry[] = [];
        const used = new Set<string>();
        for (const ref of order) {
            const key = mediaKey(ref);
            const entry = byKey.get(key);
            if (!entry || used.has(key)) {
                return null;
            }
            used.add(key);
            reordered.push(entry);
        }
        // 成员与父集完全一致（精确排列），复用键集免重建
        return new MusicCollection(
            reordered,
            PlaylistMusicSortMode.Manual,
            this.#keySet,
        );
    }

    /** 切换排序模式；entries 不动 */
    withSortMode(mode: PlaylistMusicSortMode): MusicCollection {
        if (mode === this.sortMode) {
            return this;
        }
        // entries 与成员均不变、仅展示序变，复用键集免重建
        return new MusicCollection(this.entries, mode, this.#keySet);
    }

    /**
     * 用 items 整体设定成员与 manual 顺序：items 内按 platform+id 去重保首条、非法项（无 platform+id）跳过、可为空
     * 匹配原成员沿用其 addedAt/batchRank（保加入时间排序与封面派生的加入序），新成员用传入 addedAt + 批内 rank
     * sortMode 不变，是否切 Manual 由调用方决定
     */
    setItems(items: readonly MusicItem[], addedAt: number): MusicCollection {
        const byKey = new Map(
            this.entries.map(entry => [mediaKey(entry.item), entry]),
        );
        const seen = new Set<string>();
        const nextEntries: PlaylistMusicEntry[] = [];
        let newRank = 0;
        for (const raw of items) {
            const item = coerceMusicItem(raw);
            if (!item) {
                continue;
            }
            const key = mediaKey(item);
            if (seen.has(key)) {
                continue;
            }
            seen.add(key);
            const existing = byKey.get(key);
            nextEntries.push(
                existing
                    ? {
                          item,
                          addedAt: existing.addedAt,
                          batchRank: existing.batchRank,
                      }
                    : { item, addedAt, batchRank: newRank++ },
            );
        }
        return new MusicCollection(nextEntries, this.sortMode, seen);
    }
}

/**
 * 按 sortMode 产出展示列表；base 为 manual 序
 * AddedAt 按加入全序（addedAt→batchRank→mediaKey）升序、AddedAtDesc 为其反转；字段排序用稳定排序、等键落回 manual 序
 */
function sortEntries(
    entries: readonly PlaylistMusicEntry[],
    mode: PlaylistMusicSortMode,
): readonly MusicItem[] {
    switch (mode) {
        case PlaylistMusicSortMode.Manual:
            return entries.map(entry => entry.item);
        case PlaylistMusicSortMode.AddedAt:
            return sortByAdded(entries);
        case PlaylistMusicSortMode.AddedAtDesc:
            return sortByAdded(entries).reverse();
        case PlaylistMusicSortMode.Title:
            return sortByField(entries, 'title', false);
        case PlaylistMusicSortMode.TitleDesc:
            return sortByField(entries, 'title', true);
        case PlaylistMusicSortMode.Artist:
            return sortByField(entries, 'artist', false);
        case PlaylistMusicSortMode.ArtistDesc:
            return sortByField(entries, 'artist', true);
        case PlaylistMusicSortMode.Album:
            return sortByField(entries, 'album', false);
        case PlaylistMusicSortMode.AlbumDesc:
            return sortByField(entries, 'album', true);
    }
}

/** 加入全序：addedAt → batchRank → mediaKey；末键保证唯一且与数组位置无关，排序与封面共用此确定性顺序 */
function compareAddedOrder(
    a: PlaylistMusicEntry,
    b: PlaylistMusicEntry,
): number {
    return (
        a.addedAt - b.addedAt ||
        a.batchRank - b.batchRank ||
        mediaKey(a.item).localeCompare(mediaKey(b.item))
    );
}

/** 按加入全序升序（供 AddedAt；AddedAtDesc 为其反转——全序无等键，反转不扰动并列项） */
function sortByAdded(entries: readonly PlaylistMusicEntry[]): MusicItem[] {
    return entries
        .slice()
        .sort(compareAddedOrder)
        .map(entry => entry.item);
}

/**
 * 按字符串字段 localeCompare 排序，缺省 ''，稳定排序保 manual 序
 * 降序取反比较器而非 reverse 数组：字段值并列时仍保持 manual 序，不被一并翻转
 */
function sortByField(
    entries: readonly PlaylistMusicEntry[],
    field: 'title' | 'artist' | 'album',
    desc: boolean,
): MusicItem[] {
    const dir = desc ? -1 : 1;
    return entries
        .slice()
        .sort(
            (a, b) =>
                dir *
                fieldValue(a.item, field).localeCompare(
                    fieldValue(b.item, field),
                ),
        )
        .map(entry => entry.item);
}

/** 取字段字符串值，缺省或非字符串回落 '' */
function fieldValue(
    item: MusicItem,
    field: 'title' | 'artist' | 'album',
): string {
    const value = item[field];
    return typeof value === 'string' ? value : '';
}

/** 按 platform+id 去重保首条，产出自有数组与其成员键集（键集移交调用方作 #keySet） */
function dedupeByKey(entries: readonly PlaylistMusicEntry[]): {
    entries: PlaylistMusicEntry[];
    keys: Set<string>;
} {
    const seen = new Set<string>();
    const unique: PlaylistMusicEntry[] = [];
    for (const entry of entries) {
        const key = mediaKey(entry.item);
        if (seen.has(key)) {
            continue;
        }
        seen.add(key);
        unique.push(entry);
    }
    return { entries: unique, keys: seen };
}
