import { atom } from 'jotai';

import { atomStore } from '@/utils/atomStore';

/** 备份相关的耗时操作；同一时刻只允许一项，用于拦并发并让入口显示进行中 */
export type BackupOp = 'exporting' | 'reading' | 'restoring';

export const backupOpAtom = atom<BackupOp | null>(null);

/**
 * 当前操作能不能取消
 *
 * **按这一次的去处 / 来源判，不按操作名判**：同一个 `exporting` 里，传 WebDAV 接得上
 * 取消信号，写本机下载目录接不上；`reading` 的 WebDAV 和链接来源都支持取消。
 * 按操作名判会在接不上的路径上摆一个按了没反应的取消键——那正是这次要消灭的症状
 */
export const backupCancellableAtom = atom(false);

/** 当前操作的取消口；与 backupOpAtom 同生同死，不进 atom（AbortController 不是渲染数据） */
let currentAbort: AbortController | null = null;

/** 抢到操作时拿到的凭据 */
export interface BackupOpHandle {
    /**
     * 交给会发网络请求的 core 调用
     * 用户按取消时它会 abort，请求被真掐掉、操作以「已取消」结束
     */
    signal: AbortSignal;
}

/**
 * 抢占耗时操作；已有操作在跑则返回 undefined
 * 检查与占位之间无 await，故不会被另一次抢占插进来
 *
 * `cancellable` 由调用方按这一次的去处 / 来源给出：只有真把 `handle.signal` 交下去的
 * 那条路径才算可取消。恢复恒为 false——它在往本机写，半途停下留一份说不清写到哪的数据
 */
export function tryBeginBackupOp(
    op: BackupOp,
    cancellable: boolean,
): BackupOpHandle | undefined {
    if (atomStore.get(backupOpAtom) !== null) {
        return undefined;
    }
    atomStore.set(backupOpAtom, op);
    atomStore.set(backupCancellableAtom, cancellable);
    currentAbort = new AbortController();
    return { signal: currentAbort.signal };
}

/** 释放自己那一项；不是自己占的就不动，免得清掉别人的状态 */
export function endBackupOp(op: BackupOp): void {
    if (atomStore.get(backupOpAtom) === op) {
        atomStore.set(backupOpAtom, null);
        atomStore.set(backupCancellableAtom, false);
        currentAbort = null;
    }
}

/**
 * 请求取消当前操作
 * 只发信号、不清占位：占位要等那次操作自己结算才放，否则用户能在旧操作还在收尾时开始新的
 */
export function cancelBackupOp(): void {
    currentAbort?.abort();
}
