/**
 * 是否有阻断层（dialog/panel）在展示——app 内容据此对读屏隔离
 * 包住内部 hasBlockingOverlayAtom，不把 atom 暴露出 barrel
 */
import { useAtomValue } from 'jotai';

import { hasBlockingOverlayAtom } from './kernel/store';

export function useHasBlockingOverlay(): boolean {
    return useAtomValue(hasBlockingOverlayAtom);
}
