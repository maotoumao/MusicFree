import { iconButtonEdgeInset } from '@/components/ui/iconButtonGeometry';
import { layout } from '@/design';
import { contentMaxWidthFor } from '@/hooks/useContentColumn';

import type { ContentColumnKind } from '@/hooks/useContentColumn';
import type { LayoutClass } from '@/hooks/useLayoutClass';
import type { ViewStyle } from 'react-native';

/**
 * AppBar 内容行高度：矮窗换矮档
 *
 * 抽成一处是因为这个数有多个必须同步的下游：AppBar / ImmersiveAppBar 的行高、
 * ImmersiveAppBar 的封面→实底过渡带（以一个行高为带宽）与 scrim 高，
 * 以及 ArtistWorksScaffold 里 Tabs 的吸顶位（insets.top + 行高）。
 * 谁单独写死一个字面量，Tabs 就会吸在 AppBar 下沿之外
 *
 * 还有两个**不以本函数取值**的下游，grep `layout.appBarHeight` 抓不到，改这里时去看一眼：
 * - overlay/shells/Panel 的横屏顶距：用手调常数让面板头部中线与 AppBar 中线视觉齐平，
 *   按「手机看朝向 / 平板看 layoutClass」的复合判据而非矮窗，故没有并进来（差 2dp，知情）
 * - pages/localMusic/components/LibraryRail 的头注释：里面有一笔按 56 / 64 算的 chrome 账
 */
export function appBarHeightFor(isCompact: boolean): number {
    return isCompact ? layout.appBarCompactHeight : layout.appBarHeight;
}

/**
 * 顶栏内容行在平板上的对齐样式（AppBar / ImmersiveAppBar 共用）
 *
 * 原则「一个页面只有一个坐标系」：栏本身恒通栏铺色（它是锚定屏幕边缘的 chrome），
 * 但行内的返回键 / 标题 / 动作要落在与正文相同的内容线上——
 * 单列页传 contentWidth 让行与内容列同宽居中；分栏页不传，行满宽但内距升到平板档。
 *
 * **手机恒返回 undefined**：静态 styles.row 原样生效，渲染与今天一致。
 */
export function appBarRowStyleFor(
    layoutClass: LayoutClass,
    contentWidth?: ContentColumnKind,
): ViewStyle | undefined {
    if (layoutClass === 'phone') {
        return undefined;
    }
    const tabletGutter = layout.gutter.tablet;
    // 两端是 44 命中区的图标按钮：外推壳内留白后，图标本体才落在内容线上（同静态 ROW_INSET 的算法）
    const rowInset = iconButtonEdgeInset(tabletGutter);
    if (contentWidth === undefined) {
        return { paddingHorizontal: rowInset };
    }
    return {
        paddingHorizontal: rowInset,
        width: '100%',
        maxWidth: contentMaxWidthFor(contentWidth) + tabletGutter * 2,
        alignSelf: 'center',
    };
}
