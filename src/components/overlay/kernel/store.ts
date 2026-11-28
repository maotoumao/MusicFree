/**
 * overlay 状态：jotai atoms（内部真相源）；命令式读写走 controller.ts / opener.ts
 * dialog 单例 lane + toast 队列；panels 抽屉栈待 1a-3
 */
import { atom } from 'jotai';

import type { OverlayInstance } from './types';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

/** toast 可选行动点（如「撤销」「重试」） */
export interface ToastAction {
    readonly label: string;
    readonly onPress: () => void;
}

export interface ToastEntry {
    readonly id: string;
    readonly message: string;
    readonly type: ToastType;
    /** 显示时长（ms） */
    readonly duration: number;
    readonly action?: ToastAction;
}

/** toast 队列（顶部渲染、上限若干条、自动消失） */
export const toastsAtom = atom<readonly ToastEntry[]>([]);

/** 当前 dialog（单例，结构上恒压 panel 之上） */
export const dialogAtom = atom<OverlayInstance | null>(null);

/** panel 抽屉栈（全部保持挂载，只栏顶可见/可交互） */
export const panelsAtom = atom<readonly OverlayInstance[]>([]);

/** 是否有阻断层（dialog 或 panel）在展示——app 内容据此对读屏隐藏 */
export const hasBlockingOverlayAtom = atom(
    get => get(dialogAtom) !== null || get(panelsAtom).length > 0,
);
