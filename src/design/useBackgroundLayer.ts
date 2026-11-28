import { useAtomValue } from 'jotai';

import { backgroundLayerAtom } from './colorScheme';

import type { ThemeBackgroundLayer } from './colorScheme';

/** 读取当前主题的背景图层参数；null 表示使用纯色页面背景 */
function useBackgroundLayer(): ThemeBackgroundLayer | null {
    return useAtomValue(backgroundLayerAtom);
}

export { useBackgroundLayer };
