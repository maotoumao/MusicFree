/**
 * 已下载库的反应式读取层（React hooks）：只读，写全走命令式 `download`
 */
import { useAtomValue } from 'jotai';
import { useMemo } from 'react';

import { downloadedAtom } from './store';

import type { DownloadedEntry } from './types';

/** 下载页「已完成」数据源：本机下载过的歌，按下载完成时间倒序 */
export function useDownloadedList(): readonly DownloadedEntry[] {
    const downloaded = useAtomValue(downloadedAtom);
    return useMemo(
        () =>
            [...downloaded.values()].sort(
                (a, b) => b.file.completedAt - a.file.completedAt,
            ),
        [downloaded],
    );
}

/**
 * 下载页「已完成」的条数
 * 单独一个 hook 而不是 `useDownloadedList().length`：角标只要个数字，
 * 不必为此复制整张表再遍历时间戳排序
 */
export function useDownloadedCount(): number {
    return useAtomValue(downloadedAtom).size;
}
