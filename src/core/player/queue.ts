import { mediaKey } from '@/utils/media';

import type { MediaRef, MusicItem } from '@/types';

/** 队列软性上限：超出按 pivot 窗口收缩（沿用 legacy 的 10000） */
const MAX_QUEUE_SIZE = 10000;
/** 收缩窗口半径 */
const HALF_QUEUE_SIZE = MAX_QUEUE_SIZE / 2;

/** 队列条目：曲目 + 插入序号（退出随机后按它还原原始顺序） */
interface QueueEntry {
    item: MusicItem;
    insertionOrder: number;
}

/** 批内按身份去重，保留先出现的 */
function dedupeBatch(items: readonly MusicItem[]): MusicItem[] {
    const seen = new Set<string>();
    const out: MusicItem[] = [];
    for (const item of items) {
        const key = mediaKey(item);
        if (!seen.has(key)) {
            seen.add(key);
            out.push(item);
        }
    }
    return out;
}

/** Fisher–Yates 原地洗牌 */
function shuffleInPlace<T>(arr: T[]): void {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const a = arr[i];
        const b = arr[j];
        if (a !== undefined && b !== undefined) {
            arr[i] = b;
            arr[j] = a;
        }
    }
}

/** 校验会话恢复传入的原始名次：长度与曲目一致、元素为互不相同的安全整数；不合法返 null（调用方退化为按传入顺序编号） */
function validateOriginalOrder(
    items: readonly MusicItem[],
    order: readonly number[] | undefined,
): readonly number[] | null {
    if (!order || order.length !== items.length) {
        return null;
    }
    const seen = new Set<number>();
    for (const value of order) {
        // 安全整数：非安全区间的名次会让后续 max + 1 得到同值，新入队曲目的插入序与它冲突
        if (!Number.isSafeInteger(value) || seen.has(value)) {
            return null;
        }
        seen.add(value);
    }
    return order;
}

/**
 * 播放队列模型（纯数据结构：不碰引擎、不管播放、不知道 RepeatMode）
 * · 有序 MusicItem + mediaKey→下标 索引表（O(1) 查找 / 去重）
 * · insertionOrder 单调递增、只增不重编号：随机后按它还原原始顺序，删歌不影响其余
 * · 上限 10000，超出按 pivot 窗口收缩
 * 环绕 / 单曲 / 随机等 repeat 语义由 slots 层在 nextIndexOf 之上决定，队列本身只给数组导航
 */
export class PlayQueue {
    #entries: QueueEntry[] = [];
    readonly #index = new Map<string, number>();
    #nextInsertionOrder = 0;

    /** 队列曲目（按当前顺序） */
    get items(): MusicItem[] {
        return this.#entries.map(e => e.item);
    }

    get size(): number {
        return this.#entries.length;
    }

    isEmpty(): boolean {
        return this.#entries.length === 0;
    }

    /** ref 在队列中的下标；不在返 -1（O(1)） */
    indexOf(ref: MediaRef): number {
        return this.#index.get(mediaKey(ref)) ?? -1;
    }

    has(ref: MediaRef): boolean {
        return this.#index.has(mediaKey(ref));
    }

    /** 取下标处曲目（越界返 undefined，不环绕） */
    at(index: number): MusicItem | undefined {
        return this.#entries[index]?.item;
    }

    /** 下一个下标（环绕）；仅接受 [0, size) 的整数，其余（含 -1 未找到 / 非法值）返 null */
    nextIndexOf(index: number): number | null {
        const n = this.#entries.length;
        return this.#isValidIndex(index) ? (index + 1) % n : null;
    }

    /** 上一个下标（环绕）；仅接受 [0, size) 的整数，其余返 null */
    prevIndexOf(index: number): number | null {
        const n = this.#entries.length;
        return this.#isValidIndex(index) ? (index - 1 + n) % n : null;
    }

    /** 追加到队尾（新曲去重、已入队的忽略，超上限收缩） */
    append(items: MusicItem[]): void {
        const fresh = dedupeBatch(items).filter(
            item => !this.#index.has(mediaKey(item)),
        );
        if (fresh.length === 0) {
            return;
        }
        for (const item of fresh) {
            this.#entries.push({
                item,
                insertionOrder: this.#nextInsertionOrder++,
            });
        }
        this.#capAround(this.#entries.length - 1);
        this.#reindex();
    }

    /**
     * 插到 ref 之后（addNext）；已入队的同身份曲目先摘出再插入（移动语义 + 拿新插入序）
     * ref 不在 / 队列空 / ref 本身在批内被摘掉，则追加到队尾
     */
    insertAfter(ref: MediaRef, items: MusicItem[]): void {
        const batch = dedupeBatch(items);
        if (batch.length === 0) {
            return;
        }
        const batchKeys = new Set(batch.map(mediaKey));
        this.#entries = this.#entries.filter(
            e => !batchKeys.has(mediaKey(e.item)),
        );
        this.#reindex();
        const at = this.#index.get(mediaKey(ref));
        const insertAt = at === undefined ? this.#entries.length : at + 1;
        this.#entries.splice(
            insertAt,
            0,
            ...batch.map(item => ({
                item,
                insertionOrder: this.#nextInsertionOrder++,
            })),
        );
        this.#capAround(insertAt);
        this.#reindex();
    }

    /** 移除；返回被移除的下标（不在返 -1） */
    remove(ref: MediaRef): number {
        const at = this.#index.get(mediaKey(ref));
        if (at === undefined) {
            return -1;
        }
        this.#entries.splice(at, 1);
        this.#reindex();
        return at;
    }

    clear(): void {
        this.#entries = [];
        this.#index.clear();
    }

    /** 整体替换队列（列表点歌 / 会话恢复）；批内去重，围绕 pivot 收缩
     * originalOrder 为会话恢复用的原始名次（与 items 同下标）：给了就据它重建插入序，
     * 使跨会话退出随机仍能还原原始顺序；不合法则忽略、按传入顺序重新编号
     */
    replace(
        items: readonly MusicItem[],
        pivot?: MediaRef,
        originalOrder?: readonly number[],
    ): void {
        const order = validateOriginalOrder(items, originalOrder);
        const seen = new Set<string>();
        const entries: QueueEntry[] = [];
        items.forEach((item, i) => {
            const key = mediaKey(item);
            if (seen.has(key)) {
                return;
            }
            seen.add(key);
            entries.push({
                item,
                insertionOrder: order ? order[i]! : this.#nextInsertionOrder++,
            });
        });
        this.#entries = entries;
        if (order) {
            // 后续 append / insertAfter 必须排在恢复的名次之后
            let max = -1;
            for (const entry of entries) {
                if (entry.insertionOrder > max) {
                    max = entry.insertionOrder;
                }
            }
            this.#nextInsertionOrder = max + 1;
        }
        const pivotKey = pivot ? mediaKey(pivot) : undefined;
        const pivotIndex = pivotKey
            ? entries.findIndex(e => mediaKey(e.item) === pivotKey)
            : 0;
        this.#capAround(pivotIndex >= 0 ? pivotIndex : 0);
        this.#reindex();
    }

    /**
     * 每个位置的曲目在原始顺序中的名次（0..size-1，与 items 同下标）
     * 持久化它即可跨会话保留原始顺序；恒等（0,1,2…）表示当前就是原始顺序
     */
    get originalOrder(): number[] {
        const byInsertion = this.#entries
            .map((entry, index) => ({ order: entry.insertionOrder, index }))
            .sort((a, b) => a.order - b.order);
        const ranks = new Array<number>(this.#entries.length);
        byInsertion.forEach(({ index }, rank) => {
            ranks[index] = rank;
        });
        return ranks;
    }

    /** 随机打乱整队（当前曲靠 identity 播放、不受下标变化影响） */
    shuffle(): void {
        shuffleInPlace(this.#entries);
        this.#reindex();
    }

    /** 退出随机：按 insertionOrder 还原原始顺序 */
    restoreOrder(): void {
        this.#entries.sort((a, b) => a.insertionOrder - b.insertionOrder);
        this.#reindex();
    }

    /** 是否 [0, size) 内的整数下标 */
    #isValidIndex(index: number): boolean {
        return (
            Number.isInteger(index) &&
            index >= 0 &&
            index < this.#entries.length
        );
    }

    /** 重建 mediaKey→下标 索引表 */
    #reindex(): void {
        this.#index.clear();
        this.#entries.forEach((e, i) => this.#index.set(mediaKey(e.item), i));
    }

    /** 超上限时按 pivot 窗口收缩：pivot 在前半保留头 MAX，否则保留以 pivot 为中心的 MAX 窗口 */
    #capAround(pivotIndex: number): void {
        if (this.#entries.length <= MAX_QUEUE_SIZE) {
            return;
        }
        const start =
            pivotIndex < HALF_QUEUE_SIZE
                ? 0
                : Math.min(
                      pivotIndex - HALF_QUEUE_SIZE,
                      this.#entries.length - MAX_QUEUE_SIZE,
                  );
        this.#entries = this.#entries.slice(start, start + MAX_QUEUE_SIZE);
    }
}
