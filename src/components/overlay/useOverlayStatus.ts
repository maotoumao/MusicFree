/**
 * overlay active 契约：挂载隐藏的 panel 经 context 向内容层暴露 active/visible
 * 内容层据此在隐藏时暂停轮询/自动播/重活；壳层（Panel/Dialog）负责 provide
 * 不在 overlay 内（或普通 dialog）默认 active+visible=true
 */
import { createContext, useContext } from 'react';

import type { OverlayStatus } from './kernel/types';

const OverlayStatusContext = createContext<OverlayStatus>({
    active: true,
    visible: true,
    entered: true,
});

export const OverlayStatusProvider = OverlayStatusContext.Provider;

/** 读当前 overlay 层的 active/visible（内容层用来在隐藏时停重活） */
export function useOverlayStatus(): OverlayStatus {
    return useContext(OverlayStatusContext);
}
