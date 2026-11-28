/**
 * typed opener 工厂：定义组件即得到一个类型化 opener（payload/result 从组件推断）
 * 无 name/注册表/声明合并；kind 在 define 时定；opener 返回 OverlayHandle（await 或 .close）
 */
import { atomStore } from '@/utils/atomStore';

import { closeBlockingOverlays } from './controller';
import { dialogAtom, panelsAtom } from './store';

import type {
    OverlayHandle,
    OverlayInstance,
    OverlayOptions,
    OverlayProps,
    OverlayOpenOptions,
    PanelOptions,
} from './types';
import type { ComponentType } from 'react';

let seq = 0;

/** panel 栈深上限：超限拒绝打开（提示改用导航流） */
const MAX_PANEL_DEPTH = 5;

type ErasedComponent = ComponentType<{
    payload: unknown;
    close: (result?: unknown) => void;
}>;

/** presence：把某 panel 标记为退场中（留挂载，壳播完退场再 removePanel），不动其他字段 */
function markPanelExiting(id: string): void {
    atomStore.set(
        panelsAtom,
        atomStore
            .get(panelsAtom)
            .map(e => (e.id === id ? { ...e, exiting: true } : e)),
    );
}

/** presence：把 dialog 标记为退场中（留挂载，壳播完退场再 removeDialog），仅当仍是该实例 */
function markDialogExiting(id: string): void {
    const cur = atomStore.get(dialogAtom);
    if (cur?.id === id) {
        atomStore.set(dialogAtom, { ...cur, exiting: true });
    }
}

/**
 * 定义一个居中 dialog，返回类型化 opener
 * dialog 单例：新 dialog 替换旧的、旧 Promise 结算 undefined
 */
export function defineDialog<I, R = void>(
    Component: ComponentType<OverlayProps<I, R>>,
    opts?: OverlayOptions,
): (payload: I) => OverlayHandle<R> {
    const erased = Component as ErasedComponent;
    return (payload: I): OverlayHandle<R> => {
        const id = `dlg-${++seq}`;
        let settle!: (result: R | undefined) => void;
        let settled = false;
        const promise = new Promise<R | undefined>(resolve => {
            settle = resolve;
        });
        const close = (result?: R): void => {
            if (settled) {
                return;
            }
            settled = true;
            // presence：仅标记 exiting 留挂载，壳播完退场再 removeDialog 真卸载
            // （绕开声明式 exiting 在 New Arch/Fabric 的整屏白闪）；mark 内部仅当自己仍是当前 dialog（旧 handle 关不到新 dialog）
            markDialogExiting(id);
            settle(result);
        };
        // 替换现有 dialog：旧的先结算 undefined
        atomStore.get(dialogAtom)?.close(undefined);
        const instance: OverlayInstance = {
            id,
            kind: 'dialog',
            Component: erased,
            payload,
            close: close as (result?: unknown) => void,
            options: opts,
        };
        atomStore.set(dialogAtom, instance);
        const handle = promise as OverlayHandle<R>;
        handle.close = close;
        return handle;
    };
}

/**
 * 定义一个抽屉 panel，返回类型化 opener
 * panel 入栈（非替换）：全部保持挂载、只栏顶可见，支持 await 子面板链式动线
 * 关非栏顶 = 关它及其上方所有子 panel（不留孤儿流程）；栈深超 MAX_PANEL_DEPTH 拒开
 */
export function definePanel<I, R = void>(
    Component: ComponentType<OverlayProps<I, R>>,
    opts?: PanelOptions,
): (payload: I, options?: OverlayOpenOptions) => OverlayHandle<R> {
    return defineStacked('panel', Component, opts);
}

/**
 * 定义一个全屏 overlay，返回类型化 opener
 * 与 panel 同栈：入栈 / 返回键 / exclusive / presence 语义完全一致，只是壳铺满整屏
 */
export function defineFullScreen<I, R = void>(
    Component: ComponentType<OverlayProps<I, R>>,
    opts?: OverlayOptions,
): (payload: I, options?: OverlayOpenOptions) => OverlayHandle<R> {
    return defineStacked('fullscreen', Component, opts);
}

/** panel 与 fullscreen 共用的入栈 opener 工厂：两者只差渲染用的壳，栈语义相同 */
function defineStacked<I, R>(
    kind: 'panel' | 'fullscreen',
    Component: ComponentType<OverlayProps<I, R>>,
    opts?: OverlayOptions,
): (payload: I, options?: OverlayOpenOptions) => OverlayHandle<R> {
    const erased = Component as ErasedComponent;
    return (payload: I, options?: OverlayOpenOptions): OverlayHandle<R> => {
        // exclusive：先清掉所有 blocking 层（dialog + 现有 panel 栈），再独占入栈
        if (options?.behavior === 'exclusive') {
            closeBlockingOverlays();
        }
        const id = `pnl-${++seq}`;
        let settle!: (result: R | undefined) => void;
        let settled = false;
        const promise = new Promise<R | undefined>(resolve => {
            settle = resolve;
        });
        const close = (result?: R): void => {
            if (settled) {
                return;
            }
            const stack = atomStore.get(panelsAtom);
            const idx = stack.findIndex(e => e.id === id);
            if (idx === -1) {
                // 已不在栈（被父级 close 级联移除）：只结算自身 promise
                settled = true;
                settle(result);
                return;
            }
            // 先自顶向下关上方所有子 panel（各幂等、结算 undefined）
            for (let i = stack.length - 1; i > idx; i--) {
                stack[i]?.close(undefined);
            }
            settled = true;
            // presence：仅标记 exiting 留挂载，壳播完退场动画再 removePanel 真卸载
            // （绕开声明式 exiting 在 New Arch/Fabric 的整屏白闪）
            markPanelExiting(id);
            settle(result);
        };
        const stack = atomStore.get(panelsAtom);
        // 深度只算未退场实例：退场中的旧 panel 仍暂留栈里等动画，不该挤占新面板名额
        const liveDepth = stack.filter(e => !e.exiting).length;
        if (liveDepth >= MAX_PANEL_DEPTH) {
            if (__DEV__) {
                console.warn(
                    `[overlay] panel 栈深超上限 ${MAX_PANEL_DEPTH}，拒绝打开（改用导航流）`,
                );
            }
            settled = true;
            settle(undefined);
            const rejected = promise as OverlayHandle<R>;
            rejected.close = close;
            return rejected;
        }
        const instance: OverlayInstance = {
            id,
            kind,
            Component: erased,
            payload,
            close: close as (result?: unknown) => void,
            options: opts,
        };
        atomStore.set(panelsAtom, [...stack, instance]);
        const handle = promise as OverlayHandle<R>;
        handle.close = close;
        return handle;
    };
}
