import { useAtomValue } from 'jotai';

import { colorsAtom } from './colorScheme';

import type { Colors } from './tokens/colors';

/** 读取当前生效的语义颜色（随浅深/自定义响应式更新） */
export function useColors(): Colors {
    return useAtomValue(colorsAtom);
}
