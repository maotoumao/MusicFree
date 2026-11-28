import { layout } from '@/design';
import { isCompactHeight } from '@/hooks/useCompactHeight';
import {
    contentColumnStyleFor,
    gutterExtraFor,
} from '@/hooks/useContentColumn';

import type { LayoutClass } from '@/hooks/useLayoutClass';
import type { ViewStyle } from 'react-native';

/** 手机横屏沿用的旧行容器：宽 > 640 时收窄居中（适配第一步已上线的行为，原样保留） */
const LEGACY_ROW: ViewStyle = {
    width: '100%',
    maxWidth: layout.listContentMaxWidth,
    alignSelf: 'center',
};

/**
 * 分栏里「行」的限宽容器样式：按 `listMaxWidth` 封顶 + 保留平板内容线
 *
 * 限宽的目的是「一行别宽到副标题与时长互相看不见」，判据本该是**这一列有多宽**；
 * 但 `mediaRowContainerFor` 只拿得到窗口宽，于是分栏页里它会拿整窗宽去判、
 * 在一条已经很窄的栏里再套一层 640——列比它窄时无害，列比它宽时（如「全部」独占右区）
 * 就把刚腾出来的宽度又还回去了。故分栏页显式声明 `pane`，改由这一档兜底
 *
 * `ListHeaderComponent` 之外的工具条也要用它对齐，**不能**用 `ContentColumn kind="list"`：
 * 那一档是 `840 + 2×32 = 904`（内容线算在限宽里），而这一档是「840 封顶 + 内容线另加」，
 * 右区够宽时两者外缘每侧差 32dp
 */
export function paneRowStyleFor(layoutClass: LayoutClass): ViewStyle {
    return {
        width: '100%',
        maxWidth: layout.listMaxWidth,
        alignSelf: 'center',
        // 平板内容线仍要补：限宽换掉了，内容线是另一件事，不能一起丢
        ...gutterExtraFor(layoutClass),
    };
}

/**
 * 「定位到当前曲」浮标要额外往里收多少（dp，纯计算）
 *
 * 浮标贴的是列表的右缘，而 ⋮ 贴的是**行内容盒**的右缘，两者差两段：
 * 1. 限宽留白：行被 maxWidth 收窄并居中时，每侧 (列表宽 − 限宽) / 2
 * 2. 行容器自己的横向内距：平板档的 contentColumnStyleFor / paneRowStyleFor 都带
 *    paddingHorizontal（内容线 32 − 手机档 16），行里的 ⋮ 相对这层内距盒右对齐
 *
 * 只算第 1 段的话平板会漏：列表宽 800 非分栏时 maxWidth 904 根本不触顶、留白为 0，
 * 而行仍有 16 的内距，浮标就会压回 ⋮ 上
 *
 * @param rowContainer 行的限宽容器样式（`mediaRowContainerFor` 的结果）；undefined = 行满幅
 * @param listWidth 列表**实测**宽；未量到时传 null（此时只能算内距那一段）
 */
export function locateGutterFor(
    rowContainer: ViewStyle | undefined,
    listWidth: number | null,
): number {
    if (rowContainer === undefined) {
        return 0;
    }
    const cap = rowContainer.maxWidth;
    const capGap =
        typeof cap === 'number' && listWidth !== null
            ? Math.max(0, (listWidth - cap) / 2)
            : 0;
    /*
     * 只认 paddingRight / paddingHorizontal——本仓三处行容器样式用的就是这两个键。
     * 将来谁给行加 paddingEnd / paddingInlineEnd（逻辑向内距）这里会**静默漏算**。
     * 真正会拦住那种改动的是测试里按档位取真实行样式的那几条
     * （`expect(row?.paddingHorizontal).toBe(16)` 一类）；另有一条固定夹具断言
     * 只是把「不认逻辑向内距」这个边界**声明**出来，它本身不会因行样式变更而红
     */
    const padRight =
        rowContainer.paddingRight ?? rowContainer.paddingHorizontal;
    return capGap + (typeof padRight === 'number' ? padRight : 0);
}

/**
 * 单列媒体行要不要包一层限宽容器、包成什么样（纯计算）
 *
 * - pane：调用方已经把行放进一条定宽栏里 → 只按 listMaxWidth 兜底（与尺寸类无关）
 * - phone 矮窗（手机横屏）：**不限宽**，见下
 * - phone 其余：与适配前一致——窗口宽 > listContentMaxWidth 才包旧的 640 容器，竖屏不包
 * - 平板：包内容列（list 840 + 平板内容线 32）
 * 返回 undefined = 不包、行原样渲染
 *
 * 矮窗为什么不限宽：640 这道封顶买的是「一行别长到副标题与标记互相看不见」，代价是两侧留白。
 * 注意**取消限宽并不省高**（行高不变，省下一行只发生在首页入口网格），所以「宽度是仅有的余量」
 * 不足以当理由——它对 780 × 500 同样成立，区分不出 480 这条线。真正的理由是**视口读起来是什么**：
 * 780 × 500 里还能露七八行，它仍是一份「列表」，长行难读是主要矛盾、封顶值这个钱；
 * 780 × 360 只露得下三行，它读起来是一条「横条」，此时两侧各 70dp 的死留白才是主要矛盾。
 * 这条线因此是软的：Android 自由窗口里纵向拖过 480 会让横向布局突变一次，是知情代价。
 * 780dp 并不是本仓没渲过的宽度：平板的内容列档本就是 904（见上方 contentColumnStyleFor），
 * 本地音乐分栏的右区在线上也已按 692dp 渲同一个 MediaRow。短标题时标题末尾与来源标记
 * 之间的空档确实会随行宽变大（标题是 flex: 1），但这与平板 904 档同构、不是新形态。
 */
export function mediaRowContainerFor(
    layoutClass: LayoutClass,
    windowWidth: number,
    windowHeight: number,
    inPane = false,
): ViewStyle | undefined {
    if (inPane) {
        return paneRowStyleFor(layoutClass);
    }
    if (layoutClass === 'phone') {
        return windowWidth > layout.listContentMaxWidth &&
            !isCompactHeight(windowHeight)
            ? LEGACY_ROW
            : undefined;
    }
    return contentColumnStyleFor('list', layoutClass);
}
