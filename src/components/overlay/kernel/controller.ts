/**
 * overlay 命令式 API（React-free，经 atomStore；任意 event handler / 非 React 处可调）
 * 1a-1 仅 toast；两 lane 的 definePanel / defineDialog 待 1a-2
 */
import { atomStore } from '@/utils/atomStore';

import {
    dialogAtom,
    panelsAtom,
    toastsAtom,
    type ToastAction,
    type ToastEntry,
    type ToastType,
} from './store';

export interface ToastOptions {
    type?: ToastType;
    /** 显示时长（ms），默认 2500 */
    duration?: number;
    /** 可选行动点 */
    action?: ToastAction;
}

const DEFAULT_DURATION = 2500;
/** 同时最多几条，超出丢最旧 */
const MAX_TOASTS = 3;

let seq = 0;

/** 弹一条 toast；同文案同类型正在显示则去重忽略；超上限丢最旧 */
export function showToast(message: string, opts?: ToastOptions): void {
    const type = opts?.type ?? 'info';
    const duration = opts?.duration ?? DEFAULT_DURATION;
    const current = atomStore.get(toastsAtom);
    // 纯展示 toast 同文案同类型去重；带 action 的不去重（每个 action 是独立操作，不能吞）
    if (
        !opts?.action &&
        current.some(t => t.message === message && t.type === type)
    ) {
        return;
    }
    const entry: ToastEntry = {
        id: `toast-${++seq}`,
        message,
        type,
        duration,
        action: opts?.action,
    };
    atomStore.set(toastsAtom, [...current, entry].slice(-MAX_TOASTS));
}

/** 关一条 toast（到期自动 / 手动点击都走这里） */
export function dismissToast(id: string): void {
    const current = atomStore.get(toastsAtom);
    const next = current.filter(t => t.id !== id);
    if (next.length !== current.length) {
        atomStore.set(toastsAtom, next);
    }
}

/** 关当前 dialog（结算 undefined） */
export function closeDialog(): void {
    atomStore.get(dialogAtom)?.close(undefined);
}

/** 弹出栈顶 panel（结算 undefined） */
export function popPanel(): void {
    const stack = atomStore.get(panelsAtom);
    stack[stack.length - 1]?.close(undefined);
}

/** presence：panel 播完退场动画后真正卸载（壳的 onExited 回调）——按 id 幂等移除 */
export function removePanel(id: string): void {
    const current = atomStore.get(panelsAtom);
    const next = current.filter(e => e.id !== id);
    if (next.length !== current.length) {
        atomStore.set(panelsAtom, next);
    }
}

/** presence：dialog 播完退场动画后真正卸载（壳的 onExited 回调）——仅当仍是该实例才置 null */
export function removeDialog(id: string): void {
    if (atomStore.get(dialogAtom)?.id === id) {
        atomStore.set(dialogAtom, null);
    }
}

/** 关阻断层（dialog + panel 栈级联子面板），保留 toast——导航离开时清场用（toast 跨屏不清） */
export function closeBlockingOverlays(): void {
    atomStore.get(dialogAtom)?.close(undefined);
    atomStore
        .get(panelsAtom)
        .find(p => !p.exiting)
        ?.close(undefined);
}
