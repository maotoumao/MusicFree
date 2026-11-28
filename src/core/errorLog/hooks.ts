import { useAtomValue } from 'jotai';

import { errorRecordsAtom } from './store';

import type { ErrorRecord } from './types';

/**
 * 错误记录，newest-first
 * 只读 atom、不碰单例——碰了就会与 index 的 re-export 成环。
 * 读盘由页面在挂载时调 `errorLog.getRecords()` 触发：启动路径全程不碰这个 store
 */
export function useErrorRecords(): readonly ErrorRecord[] {
    return useAtomValue(errorRecordsAtom);
}
