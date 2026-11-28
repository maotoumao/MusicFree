import type { IConfig } from '@/core/config';
import type { MediaRef, MusicItem } from '@/types';

/**
 * 播放历史持久化 wire 契约冻结（沿用 legacy，修改会导致用户数据不兼容）
 * store 为 `music.MusicHistory`，key 为 `history`，值为采用 newest-first 顺序的 MusicItem[] 快照
 * legacy 那段「AsyncStorage(history-music-sheet) → MMKV」一次性迁移不移植：仅影响从未
 * 使用过 MMKV 版本的上古用户，丢失历史无害，处置与 plugin-meta 迁移一致
 */
export const HISTORY_STORE_ID = 'music.MusicHistory';
export const HISTORY_KEY = 'history';

/**
 * 播放历史端口：记录已真正开始播放的曲目，并按 newest-first 排序、按 platform + id 去重，再按上限截断
 * 记录时机由 app/container 接入 player.subscribePlaybackStarted（真正出声后记录）；history 不依赖 player
 * 持久化 best-effort：add/remove/replace/clear 写盘失败均内部吞掉，不向外抛出
 * add 是 player 同步回调，抛出异常会打断播放事件分发
 */
export interface IHistory {
    /** 记录一次播放：置顶，按 platform + id 去重，并截断至 basic.maxHistoryLen */
    add(item: MusicItem): void;
    /** 移除指定媒体 */
    remove(ref: MediaRef): void;
    /** 整表替换（备份恢复 / 批量编辑）：统一执行去重、截断和 newest-first 落盘 */
    replace(items: MusicItem[]): void;
    /** 清空播放历史 */
    clear(): void;
    /** 获取当前历史快照（newest-first，只读）；React 侧通过 useHistory 读取 */
    getHistory(): readonly MusicItem[];
}

/** 构造 History 所需的依赖 */
export interface HistoryDeps {
    config: IConfig;
}
