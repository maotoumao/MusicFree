import { useAtomValue } from 'jotai';

import { hasBackgroundLayerAtom } from './colorScheme';

/** 只订阅背景的有无，调整可见度与不透明度时不重渲染页面壳 */
function useHasBackgroundLayer(): boolean {
    return useAtomValue(hasBackgroundLayerAtom);
}

export { useHasBackgroundLayer };
