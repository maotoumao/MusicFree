import { useSyncExternalStore } from 'react';
import { Dimensions } from 'react-native';

import { breakpoints } from '@/design';

/**
 * 布局尺寸类：决定页面**结构**分叉（分栏 / 单列 / 手机原样）
 *
 * - phone：最小边 < 600dp——手机任何朝向、手机分屏、折叠屏外屏、翻盖机；渲染与适配前完全一致
 * - tabletPortrait：平板竖屏 / 折叠屏展开竖持——单列、限宽、顶栏对齐
 * - tabletLandscape：平板横屏——有第二栏内容的页分栏，单栏页坐在 surface 纸上
 *
 * 连续量（列数、限宽数值）不走这里，仍按 useWindowDimensions 连续算
 */
export type LayoutClass = 'phone' | 'tabletPortrait' | 'tabletLandscape';

/** 纯计算，与 React 无关——抽出来是为了直接测「手机各宽度 / 朝向恒为 phone」 */
export function layoutClassFor(width: number, height: number): LayoutClass {
    if (Math.min(width, height) < breakpoints.tabletMinEdge) {
        return 'phone';
    }
    return width < height ? 'tabletPortrait' : 'tabletLandscape';
}

function subscribe(onChange: () => void) {
    const subscription = Dimensions.addEventListener('change', onChange);
    return () => subscription.remove();
}

function getSnapshot(): LayoutClass {
    const { width, height } = Dimensions.get('window');
    return layoutClassFor(width, height);
}

/**
 * 当前尺寸类（反应式：随旋转 / 折叠展开 / 分屏变化）
 *
 * 走 useSyncExternalStore 而非 useWindowDimensions：快照就是类别字符串，
 * 分屏拖分割线时尺寸连续变、类别不变，订阅者**不重渲**
 */
export function useLayoutClass(): LayoutClass {
    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
