/**
 * 播放历史的 React hook：只读，写入通过命令式 history（IHistory）完成
 */
import { useAtomValue } from 'jotai';

import { historyAtom } from './store';

import type { MusicItem } from '@/types';

/** 读取最近播放历史（newest-first，只读） */
export function useHistory(): readonly MusicItem[] {
    return useAtomValue(historyAtom);
}
