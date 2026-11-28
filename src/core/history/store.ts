/**
 * 播放历史的 live 真相源：保存 newest-first 的 MusicItem[] 快照
 * History 通过 setHistory 替换整表，React 侧通过 useHistory 订阅；变更一律使用新数组，不原地 mutate 或复用旧引用
 */
import { atom } from 'jotai';

import { atomStore } from '@/utils/atomStore';

import type { MusicItem } from '@/types';

export const historyAtom = atom<readonly MusicItem[]>([]);

/** 读取当前历史，供 History / React 使用；仅允许通过 setHistory 替换整表 */
export function getHistory(): readonly MusicItem[] {
    return atomStore.get(historyAtom);
}

/** 发布新历史表；传入新数组以触发订阅更新 */
export function setHistory(next: readonly MusicItem[]): void {
    atomStore.set(historyAtom, next);
}
