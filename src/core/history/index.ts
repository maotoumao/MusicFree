/**
 * 播放历史：记录实际开始播放的曲目，按 newest-first 排序，按 platform+id 去重并截断
 * live 真相源为 historyAtom；记录时机由 app/container 订阅 player 的 subscribePlaybackStarted 决定
 * 持久化采用 best-effort：读写盘失败均吞掉，退化为仅内存，不影响播放
 */
import { getObject, getOrCreateMMKV, setObject } from '@/infra/storage';
import { coerceMusicItem, isSameMediaRef, mediaKey } from '@/utils/media';

import { getHistory as readHistory, setHistory as writeHistory } from './store';
import { HISTORY_KEY, HISTORY_STORE_ID } from './types';

import type { HistoryDeps, IHistory } from './types';
import type { IConfig } from '@/core/config';
import type { MediaRef, MusicItem } from '@/types';

/** basic.maxHistoryLen 未配置或无效时的兜底值 */
const FALLBACK_MAX_HISTORY = 50;

export class History implements IHistory {
    readonly #config: IConfig;
    readonly #mmkv = getOrCreateMMKV(HISTORY_STORE_ID);

    constructor(deps: HistoryDeps) {
        this.#config = deps.config;
        this.#hydrate();
        this.#watchMaxLen();
    }

    add(item: MusicItem): void {
        try {
            const clean = coerceMusicItem(item);
            if (!clean) {
                return;
            }
            // 置顶 + 移除同 platform+id 旧记录（去重）+ 截断
            this.#commit(
                this.#cap([
                    clean,
                    ...readHistory().filter(it => !isSameMediaRef(it, clean)),
                ]),
            );
        } catch {
            // best-effort：记录失败不影响播放事件分发（add 为 player 同步回调）
        }
    }

    remove(ref: MediaRef): void {
        try {
            this.#commit(
                this.#cap(readHistory().filter(it => !isSameMediaRef(it, ref))),
            );
        } catch {
            // best-effort：历史操作失败不影响播放流程
        }
    }

    replace(items: MusicItem[]): void {
        try {
            this.#commit(this.#sanitize(items));
        } catch {
            // best-effort：历史操作失败不影响播放流程
        }
    }

    clear(): void {
        try {
            this.#commit([]);
        } catch {
            // best-effort：历史操作失败不影响播放流程
        }
    }

    getHistory(): readonly MusicItem[] {
        return readHistory();
    }

    /** 校验、去重并截断；hydrate 和 replace 共用的整表入口 */
    #sanitize(items: readonly unknown[]): MusicItem[] {
        const max = this.#max();
        const seen = new Set<string>();
        const out: MusicItem[] = [];
        for (const raw of items) {
            const clean = coerceMusicItem(raw);
            if (!clean) {
                continue;
            }
            const key = mediaKey(clean);
            if (seen.has(key)) {
                continue;
            }
            seen.add(key);
            out.push(clean);
            if (out.length >= max) {
                break;
            }
        }
        return out;
    }

    #cap(items: MusicItem[]): MusicItem[] {
        const max = this.#max();
        return items.length > max ? items.slice(0, max) : items;
    }

    #max(): number {
        try {
            const raw = this.#config.get('basic.maxHistoryLen');
            if (
                typeof raw === 'number' &&
                Number.isSafeInteger(raw) &&
                raw > 0
            ) {
                return raw;
            }
        } catch {
            // 配置读取失败时使用兜底值
        }
        return FALLBACK_MAX_HISTORY;
    }

    /**
     * 上限调小后立即裁掉超出的部分：#cap 只在 add / remove / replace 时生效，
     * 不订阅的话用户改完上限要等下次播歌才看到列表变短
     * 单例常驻，退订函数不保留
     */
    #watchMaxLen(): void {
        this.#config.subscribe(['basic.maxHistoryLen'], () => {
            try {
                const current = readHistory();
                const max = this.#max();
                // 调大上限时长度不变，不白写一次盘、也不触发 atom 重渲染
                if (current.length > max) {
                    this.#commit(current.slice(0, max));
                }
            } catch {
                // best-effort：裁剪失败只是上限延后生效
            }
        });
    }

    /** 发布 atom 并写盘（best-effort：写盘失败时仅保留内存态，不影响播放） */
    #commit(next: readonly MusicItem[]): void {
        writeHistory(next);
        try {
            setObject(this.#mmkv, HISTORY_KEY, next);
        } catch {
            // 写盘失败时退化为仅内存
        }
    }

    /**
     * 启动时 hydrate：读取 MMKV，校验、去重、截断后发布 atom；非数组或异常均降级为空历史
     * 规范化真的改动了内容就回写盘：只发 atom 的话，盘上仍留着超量记录——
     * 之后把上限调大、重启，那些本该被裁掉的记录会重新冒出来
     */
    #hydrate(): void {
        let next: MusicItem[] = [];
        let normalized = false;
        try {
            const raw = getObject<unknown>(this.#mmkv, HISTORY_KEY);
            if (Array.isArray(raw)) {
                next = this.#sanitize(raw);
                normalized = raw.length !== next.length;
            }
        } catch {
            // 读取或校验失败时使用空历史
        }
        if (normalized) {
            this.#commit(next);
            return;
        }
        writeHistory(next);
    }
}

/** 裸对象 live-binding；UX / core 通过此对象读写，由 app/container 装配 */
export let history: IHistory;

/** 仅供 app/container 调用：装配 history 单例 */
export function provideHistory(instance: IHistory): void {
    history = instance;
}

export { useHistory } from './hooks';
export type { IHistory, HistoryDeps } from './types';
