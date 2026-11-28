/**
 * 传输侧的反应式读取层（React hooks）：只读，写全走命令式 `download`
 *
 * 三处刻意的性能安排，缺一处就会让一次下载把整页抖起来：
 * - **任务与摘要各自订阅**：页面一次只显示一个筛选面，任务只为该面排序，摘要只计数不排序
 * - **任务 atom 按消费者创建**：建成模块级常量的话，Jotai 会把最后一次算出的数组
 *   一直留在 store 里，页面关掉后那份快照里已离队的任务再也释放不掉；
 *   摘要只有四个数字、不攥记录，共享在模块级则无此问题
 * - **进度按行订阅**：进度每 500ms 一跳，整表订阅会让所有行跟着重渲
 */
import { atom, useAtomValue } from 'jotai';
import { selectAtom } from 'jotai/utils';
import { useMemo } from 'react';

import {
    createDownloadTasksAtom,
    downloadIntervalHoldAtom,
    downloadProgressAtom,
    downloadStartingAtom,
    downloadSummaryAtom,
    pendingPhaseOf,
    wifiGateBlockedAtom,
} from './store';

import type {
    ActiveDownloadFilter,
    ActiveDownloadRecord,
    ActiveDownloadState,
    DownloadProgress,
    DownloadSummary,
    PendingDownloadPhase,
} from './types';

/** 记录是不可变快照，逐个引用相同即内容没变 */
function sameRecords(
    a: readonly ActiveDownloadRecord[],
    b: readonly ActiveDownloadRecord[],
): boolean {
    return a.length === b.length && a.every((record, i) => record === b[i]);
}

function sameSummary(a: DownloadSummary, b: DownloadSummary): boolean {
    return (
        a.downloading === b.downloading &&
        a.paused === b.paused &&
        a.inProgress === b.inProgress &&
        a.queued === b.queued &&
        a.failed === b.failed
    );
}

/** 派生 atom 每次都产出新对象，靠 selectAtom 的相等函数把「内容没变」挡在下游之外 */
const identity = <T>(value: T): T => value;

const stableSummaryAtom = selectAtom(
    downloadSummaryAtom,
    identity,
    sameSummary,
);

/**
 * 某个筛选面的任务列表
 * 内容没变就一直是同一个引用，长列表因而不必重新协调
 *
 * 「已完成」不由此提供：那是已下载库的 `useDownloadedList()`
 */
export function useDownloadTasks(
    filter: ActiveDownloadFilter,
): readonly ActiveDownloadRecord[] {
    const tasksAtom = useMemo(
        () =>
            selectAtom(createDownloadTasksAtom(filter), identity, sameRecords),
        [filter],
    );
    return useAtomValue(tasksAtom);
}

/** 摘要与分段筛选的角标计数；四个数字都没变时不推渲染 */
export function useDownloadSummary(): DownloadSummary {
    return useAtomValue(stableSummaryAtom);
}

/**
 * 单首歌的传输进度（未在传输则 undefined）
 *
 * `mediaKey` 取自 `ActiveDownloadRecord.mediaKey`——列表行手上就有，
 * 改传 `MediaRef` 会逼每行重新算一次 key
 *
 * 每行各建一个派生 atom：别的歌进度跳动时本行取到的仍是同一个对象引用，
 * Jotai 据此判定无变化、不重渲。派生 atom 随组件卸载即释放，
 * 不像 `atomFamily` 那样留下只增不减的缓存表
 */
export function useDownloadProgress(
    mediaKey: string,
): DownloadProgress | undefined {
    const rowAtom = useMemo(
        () => atom(get => get(downloadProgressAtom).get(mediaKey)),
        [mediaKey],
    );
    return useAtomValue(rowAtom);
}

/**
 * 一条任务当下处在哪一步（非 `pending` 的返回 `undefined`——那些状态自己就说完了）
 *
 * 与进度同样按行建派生 atom：三个输入里任何一个变化都只影响一两行，
 * 整表订阅会让每次调度动作都把整屏抖一遍。非 `pending` 的行压根不读那三个 atom，
 * Jotai 的动态依赖据此不给它们建订阅，闸门一开一关也不会惊动下载中与失败的行
 */
export function useDownloadPendingPhase(
    mediaKey: string,
    state: ActiveDownloadState,
): PendingDownloadPhase | undefined {
    const rowAtom = useMemo(
        () =>
            atom(get =>
                state === 'pending'
                    ? pendingPhaseOf(mediaKey, {
                          starting: get(downloadStartingAtom),
                          intervalHold: get(downloadIntervalHoldAtom),
                          waitingForWifi: get(wifiGateBlockedAtom),
                      })
                    : undefined,
            ),
        [mediaKey, state],
    );
    return useAtomValue(rowAtom);
}
