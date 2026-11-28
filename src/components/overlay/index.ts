/**
 * overlay 子系统单门 barrel：外部只从这里进（depcruise 强制）
 * 内部（store atoms / shells / OverlayInstance / OverlayStatusProvider）不导出
 * 内部文件之间走相对路径、永不 import 本 barrel（防环）
 */
export {
    closeBlockingOverlays,
    closeDialog,
    dismissToast,
    popPanel,
    showToast,
} from './kernel/controller';
export type { ToastOptions } from './kernel/controller';
export { defineDialog, defineFullScreen, definePanel } from './kernel/opener';
export type {
    OverlayHandle,
    OverlayOpenOptions,
    OverlayOptions,
    OverlayProps,
    OverlayStatus,
    PanelOptions,
} from './kernel/types';
export { OverlayHost } from './OverlayHost';
export { useHasBlockingOverlay } from './useHasBlockingOverlay';
export { useOverlayStatus } from './useOverlayStatus';
