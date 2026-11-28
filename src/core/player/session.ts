/**
 * 播放会话持久化：负责 App.PersistStatus store 的播放态读写与恢复校验
 * 纯持久化端口：只负责读取并校验上次会话、写入各字段；何时 checkpoint（暂停 / seek /
 * 切歌 / 切后台）由 Player 编排层决定并调用对应的 save 方法，此处不订阅事件、不做节流
 */

import { getObject, getOrCreateMMKV, setObject } from '@/infra/storage';
import { coerceMusicItem, isSameMediaRef } from '@/utils/media';

import { RepeatMode } from './types';

import type { MusicItem } from '@/types';

/**
 * 持久化 store id 与键：legacy 键已冻结不可改（改会破坏用户数据）；新增键（如 music.duration）不受此限
 * JS 概念名 queue 对应 wire 键 music.playList；rate 按 ×100 存储（1.0 → 100）
 *
 * `music.quality` 不在此表：音质是「要音质还是要流量」的用户偏好，与「上次听到哪」无关，
 * 真相源已归 config `basic.defaultPlayQuality`（同下载音质对称、也才进得了备份）。
 * 旧键留在原地不读不删——删它零收益，留着反而让降级回旧版本的用户还能读回自己的偏好
 */
const APP_PERSIST_STATUS_STORE_ID = 'App.PersistStatus';
export const PLAYER_PERSIST_KEYS = {
    currentMusic: 'music.musicItem',
    position: 'music.progress',
    duration: 'music.duration',
    repeatMode: 'music.repeatMode',
    queue: 'music.playList',
    queueOriginalOrder: 'music.playListOrder',
    playbackRate: 'music.rate',
} as const;

/** rate 的 wire 编码倍率：真实倍率 ×100 后按整数存储（沿用 legacy） */
const RATE_WIRE_SCALE = 100;

/** 恢复队列上限：与 PlayQueue 同为 10000；遍历到上限即停，限制恢复结果规模（JSON 解析本身无法避免） */
const MAX_RESTORED_QUEUE = 10000;

function isRepeatMode(value: unknown): value is RepeatMode {
    return (Object.values(RepeatMode) as string[]).includes(value as string);
}

/** 名次是否为 0,1,2… 的恒等排列（即当前顺序就是原始顺序，无需落盘） */
function isIdentityOrder(order: readonly number[]): boolean {
    return order.every((rank, index) => rank === index);
}

/** 经过校验的上次会话快照，供 Player.setup 恢复 */
export interface RestoredSession {
    queue: MusicItem[];
    /** 队列各曲目在原始顺序中的名次（与 queue 同下标）；缺失 / 不可信时为 undefined，视作当前顺序即原始顺序 */
    queueOriginalOrder: number[] | undefined;
    /** 当前曲目：必须是队列成员，否则为 null */
    currentMusic: MusicItem | null;
    /** 播放位置（秒）；无 currentMusic 时为 0 */
    position: number;
    /** 上次已知的曲目时长（秒）；引擎恢复暂停态尚未 tick 时用它显示总时长，无则 0 */
    duration: number;
    repeatMode: RepeatMode;
    /** 真实倍率（1.0 表示正常速率）；wire 按 ×100 存储 */
    playbackRate: number;
}

/**
 * 播放态持久化：读取并校验上次会话，按字段写入
 * 每次读写都 try/catch 隔离：单个字段读写失败仅该字段降级（读回默认 / 写入丢弃），不影响播放
 */
export class PlayerSession {
    readonly #mmkv = getOrCreateMMKV(APP_PERSIST_STATUS_STORE_ID);

    /** 读取上次会话并逐字段校验；currentMusic 必须在队列内否则丢弃，位置仅在有 currentMusic 时有效 */
    read(): RestoredSession {
        const { items: queue, originalOrder } = this.#readQueue();
        const currentMusic = this.#readCurrent(queue);
        return {
            queue,
            queueOriginalOrder: originalOrder,
            currentMusic,
            position: currentMusic ? this.#readPosition() : 0,
            duration: currentMusic ? this.#readDuration() : 0,
            repeatMode: this.#readRepeatMode(),
            playbackRate: this.#readPlaybackRate(),
        };
    }

    /** 落盘队列与原始名次；当前顺序即原始顺序时删除名次键（顺序模式下不写多余数据） */
    saveQueue(items: MusicItem[], originalOrder: number[]): void {
        this.#write(PLAYER_PERSIST_KEYS.queue, items);
        this.#write(
            PLAYER_PERSIST_KEYS.queueOriginalOrder,
            isIdentityOrder(originalOrder) ? undefined : originalOrder,
        );
    }

    /** 传入 null 清除当前曲目（删除键，对齐 legacy reset 语义） */
    saveCurrentMusic(item: MusicItem | null): void {
        this.#write(PLAYER_PERSIST_KEYS.currentMusic, item ?? undefined);
    }

    /** 返回实际落盘的位置（非有限 / 非正规范化为 0），供调用方同步节流基准 */
    savePosition(seconds: number): number {
        const normalized =
            Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
        this.#write(PLAYER_PERSIST_KEYS.position, normalized);
        return normalized;
    }

    /** 落盘曲目时长（秒）；返回实际落盘值（非有限 / 非正规范化为 0），供调用方同步「已存时长」免重复写 */
    saveDuration(seconds: number): number {
        const normalized =
            Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
        this.#write(PLAYER_PERSIST_KEYS.duration, normalized);
        return normalized;
    }

    saveRepeatMode(mode: RepeatMode): void {
        this.#write(PLAYER_PERSIST_KEYS.repeatMode, mode);
    }

    /** 真实倍率 ×100 取整落盘（离散档位，与 legacy 整数 wire 一致）；非有限 / 非正回落到 1.0 */
    savePlaybackRate(rate: number): void {
        const wire = Math.round(rate * RATE_WIRE_SCALE);
        this.#write(
            PLAYER_PERSIST_KEYS.playbackRate,
            Number.isFinite(wire) && wire > 0 ? wire : RATE_WIRE_SCALE,
        );
    }

    /** 读队列与原始名次：逐条校验曲目，被丢弃的条目其名次同步剔除（剩余值仍互不相同、相对次序不变） */
    #readQueue(): { items: MusicItem[]; originalOrder: number[] | undefined } {
        try {
            const raw = getObject<unknown>(
                this.#mmkv,
                PLAYER_PERSIST_KEYS.queue,
            );
            if (!Array.isArray(raw)) {
                return { items: [], originalOrder: undefined };
            }
            const storedOrder = this.#readQueueOriginalOrder(raw.length);
            const items: MusicItem[] = [];
            const originalOrder: number[] = [];
            for (const [index, entry] of raw.entries()) {
                const item = coerceMusicItem(entry);
                if (item) {
                    items.push(item);
                    const rank = storedOrder?.[index];
                    if (rank !== undefined) {
                        originalOrder.push(rank);
                    }
                    if (items.length >= MAX_RESTORED_QUEUE) {
                        break;
                    }
                }
            }
            return {
                items,
                originalOrder: storedOrder ? originalOrder : undefined,
            };
        } catch {
            return { items: [], originalOrder: undefined };
        }
    }

    /** 读原始名次数组；须是 [0, 队列长度) 的无重复排列（落盘时即按此产出），否则视作无、退化为按当前顺序 */
    #readQueueOriginalOrder(queueLength: number): number[] | undefined {
        const raw = getObject<unknown>(
            this.#mmkv,
            PLAYER_PERSIST_KEYS.queueOriginalOrder,
        );
        if (!Array.isArray(raw) || raw.length !== queueLength) {
            return undefined;
        }
        const seen = new Set<number>();
        for (const value of raw) {
            if (
                !Number.isInteger(value) ||
                value < 0 ||
                value >= queueLength ||
                seen.has(value)
            ) {
                return undefined;
            }
            seen.add(value);
        }
        return raw as number[];
    }

    /** 返回队列中的实例作为单一真相源，而不是持久化数据的独立副本 */
    #readCurrent(queue: MusicItem[]): MusicItem | null {
        try {
            const raw = coerceMusicItem(
                getObject<unknown>(
                    this.#mmkv,
                    PLAYER_PERSIST_KEYS.currentMusic,
                ),
            );
            if (!raw) {
                return null;
            }
            return queue.find(it => isSameMediaRef(it, raw)) ?? null;
        } catch {
            return null;
        }
    }

    #readPosition(): number {
        try {
            const raw = getObject<unknown>(
                this.#mmkv,
                PLAYER_PERSIST_KEYS.position,
            );
            return typeof raw === 'number' && Number.isFinite(raw) && raw > 0
                ? raw
                : 0;
        } catch {
            return 0;
        }
    }

    #readDuration(): number {
        try {
            const raw = getObject<unknown>(
                this.#mmkv,
                PLAYER_PERSIST_KEYS.duration,
            );
            return typeof raw === 'number' && Number.isFinite(raw) && raw > 0
                ? raw
                : 0;
        } catch {
            return 0;
        }
    }

    #readRepeatMode(): RepeatMode {
        try {
            const raw = getObject<unknown>(
                this.#mmkv,
                PLAYER_PERSIST_KEYS.repeatMode,
            );
            return isRepeatMode(raw) ? raw : RepeatMode.Queue;
        } catch {
            return RepeatMode.Queue;
        }
    }

    #readPlaybackRate(): number {
        try {
            const raw = getObject<unknown>(
                this.#mmkv,
                PLAYER_PERSIST_KEYS.playbackRate,
            );
            if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) {
                return 1;
            }
            return raw / RATE_WIRE_SCALE;
        } catch {
            return 1;
        }
    }

    #write(key: string, value: unknown): void {
        try {
            setObject(this.#mmkv, key, value);
        } catch {
            // 持久化写入失败时退化为无持久化，不影响本次播放
        }
    }
}
