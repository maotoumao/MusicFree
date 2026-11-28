import { useAtomValue } from 'jotai';

import { textShadowAtom } from './colorScheme';

import type { TextShadowLayer } from './colorScheme';

/** 文字压在背景图上的兜底阴影；undefined 表示对比度足够、不需要 */
function useTextShadow(): TextShadowLayer | undefined {
    return useAtomValue(textShadowAtom);
}

export { useTextShadow };
