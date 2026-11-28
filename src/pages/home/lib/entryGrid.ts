import { layout } from '@/design';
import {
    gridColumnsFor,
    gridColumnsWithoutOrphan,
} from '@/hooks/useGridColumns';

/**
 * 理想卡宽（dp）：手机竖屏（内容宽 ≈ 330–400）算出来恰好两列，
 * 限宽 640 的内容列（608）算出来三列；中间的折叠屏 / 分屏宽度连续过渡
 */
const ENTRY_CARD_IDEAL_WIDTH = 200;

/** 一次 onLayout 的实测结果，连同「量它时是哪一档」一起记 */
export interface EntryGridMeasurement {
    width: number;
    /** 量它时的档，由 entryGridKeyFor 生成 */
    layoutKey: string;
}

/**
 * 实测值的有效期标识：可用宽 + 限宽档
 *
 * 网格容器的宽只由这两件事决定，故它们不变时旧实测仍然作数、不变时也不该重置
 */
export function entryGridKeyFor(
    availableWidth: number,
    isCompact: boolean,
): string {
    return `${availableWidth}:${isCompact}`;
}

/**
 * 网格容器的外框宽：优先用实测，但**实测只在量它时那一档里有效**
 *
 * 不作废旧实测会出一个只有一帧的错列数：竖屏量到 360，转横屏后容器立刻变成 780 宽、
 * 却仍按 360 算出 2 列，等新的 onLayout 到达才跳成 4 列——它是 FlashList 的 header，
 * 这一跳就是可见的高度抖动。改动前这个缺陷是隐形的（360 与 640 都算 2 列，前后一致），
 * 取消限宽后才显形，所以要在这里堵住
 */
export function entryGridWidthFor(
    availableWidth: number,
    isCompact: boolean,
    measured: EntryGridMeasurement | null,
): number {
    const estimate = isCompact
        ? availableWidth
        : Math.min(availableWidth, layout.listContentMaxWidth);
    return measured?.layoutKey === entryGridKeyFor(availableWidth, isCompact)
        ? measured.width
        : estimate;
}

/**
 * 首页入口卡网格的列数：先按理想格宽算，再收成不出末行孤卡的列数
 *
 * 抽成纯函数是因为这条式子承载了矮窗取消限宽的**全部收益**：
 * 限宽 640（内容宽 608）时算出 3 列、被孤卡规则收成 2 列 → 四张卡两行；
 * 铺满手机横屏 780dp 时算出 4 列 → 一行。省下的那一行是首页在矮窗里最大的一笔空间，
 * 没有断言钉住就只能靠肉眼看
 *
 * @param gridWidth 网格容器外框宽（含两侧 screenGutter，gridColumnsFor 自行扣除）
 * @param count 卡片张数（平台不同会少：iOS 无本地音乐 / 下载入口）
 */
export function entryGridColumnsFor(gridWidth: number, count: number): number {
    return gridColumnsWithoutOrphan(
        gridColumnsFor(gridWidth, ENTRY_CARD_IDEAL_WIDTH),
        count,
    );
}
