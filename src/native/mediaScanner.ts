/**
 * MediaScanner 原生桥适配层：包裹 codegen spec（`./specs/NativeMediaScanner`）
 * 纯桥、React-free——`core/localMusic` 属主。正式代码从 `@/native/mediaScanner` 用，禁直接 import `./specs`
 * 事件（分批进度/完成/出错）由 core 订阅、按 scanId 丢弃已取消旧扫描的迟到事件
 */
import Native from './specs/NativeMediaScanner';

import type {
    ScanOptions,
    ScanProgressEvent,
    ScanCompleteEvent,
    ScanErrorEvent,
} from './specs/NativeMediaScanner';

// DTO 直接 re-export（不重定义，避免第二真相源）
export type {
    ScannedAudioFile,
    ScanOptions,
    ScanProgressEvent,
    ScanCompleteEvent,
    ScanErrorEvent,
} from './specs/NativeMediaScanner';

/** 当前平台是否提供扫描器（仅 Android；iOS 未实现，core/UI 据此隐藏本地音乐入口） */
export const isMediaScannerSupported = Native != null;

// 守卫：不支持的平台上调用时明确报错，而非静默让事件永不到达
function required(): NonNullable<typeof Native> {
    if (Native == null) {
        throw new Error('[MediaScanner] 本地音乐扫描在当前平台不可用');
    }
    return Native;
}

/** 启动扫描（原生后台线程、两阶段、分批经事件回传）；重复调按新 scanId、先取消上次 */
export function startScan(options: ScanOptions): void {
    required().startScan(options);
}

/** 取消指定代次（取消后不再发该 scanId 的完成/删除结算） */
export function cancelScan(scanId: number): void {
    required().cancelScan(scanId);
}

/** 订阅分批进度（含本批曲目） */
export function onScanProgress(listener: (e: ScanProgressEvent) => void) {
    return required().onScanProgress(listener);
}

/** 订阅扫描完成（差量 removed/failed + 统计） */
export function onScanComplete(listener: (e: ScanCompleteEvent) => void) {
    return required().onScanComplete(listener);
}

/** 订阅扫描出错（整轮失败） */
export function onScanError(listener: (e: ScanErrorEvent) => void) {
    return required().onScanError(listener);
}
