import { useWindowDimensions } from 'react-native';

import { layout } from '@/design';

/**
 * 按当前宽度算网格列数
 *
 * **不走断点。** 列数变化本身是连续的：给一个「理想格宽」，让列数随宽度自然长。
 * 用尺寸类反而会在跨阈值时突然从 2 跳到 4——折叠屏展开到一半时尤其难看。
 *
 * 等权封面格在宽屏下该**加列铺满**而不是限宽留白：格子是等权的，
 * 留白只是浪费，加列则同屏看到更多——这正是宽屏该有的收益。
 *
 * @param idealItemWidth 期望的格宽（dp）；取值应使手机上算出来**恰好等于**
 *   适配前的列数，否则就不是「手机体验不变」了
 * @param minColumns 列数下限，默认 2；窄机上不至于塌成单列
 */
export function useGridColumns(idealItemWidth: number, minColumns = 2): number {
    const { width } = useWindowDimensions();
    return gridColumnsFor(width, idealItemWidth, minColumns);
}

/**
 * 纯计算，与 React 无关——抽出来是为了能直接测「手机上恒等于适配前的列数」，
 * 而不必为每个宽度渲染一次组件
 */
export function gridColumnsFor(
    windowWidth: number,
    idealItemWidth: number,
    minColumns = 2,
): number {
    return gridColumnsForAvailable(
        windowWidth - layout.screenGutter * 2,
        idealItemWidth,
        minColumns,
    );
}

/**
 * 按「可放格子的实际宽度」算列数：网格坐在限宽内容列里（如外观页的主题卡）时，
 * 窗口宽不再是它的宽，得用量到的容器内容宽
 */
export function gridColumnsForAvailable(
    availableWidth: number,
    idealItemWidth: number,
    minColumns = 2,
): number {
    // round 而非 floor：floor 会让「差一点点」的宽度白白少一列
    return Math.max(minColumns, Math.round(availableWidth / idealItemWidth));
}

/**
 * 让固定数量的等权格子不出现末行孤卡：在 ≤ columns 的列数里取能整除 count 的最大值
 * （如 4 张卡算出 3 列 → 2 列；算出 5 列 → 4 列）。没有 ≥ 2 的整除列数（质数张）时原样返回，
 * 半行是网格的诚实状态、不为凑整硬拆
 */
export function gridColumnsWithoutOrphan(
    columns: number,
    count: number,
): number {
    for (let c = Math.min(columns, count); c >= 2; c -= 1) {
        if (count % c === 0) {
            return c;
        }
    }
    return columns;
}
