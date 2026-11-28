/**
 * 「定位到当前曲」浮标的判定规则（纯计算，与 React / FlashList 无关）
 *
 * 装三组东西，都是「要不要显示、目标在哪」这一件事的组成部分：
 * 可视区判定（visibleRangeOf / isIndexVisible / isTargetOffscreen / shouldShowLocate）、
 * 滚动相位表（scrollPhaseEffect / SCROLL_PHASE_PROPS）、目标下标表（buildKeyIndex）。
 * 接线在 ./useLocateCurrent，外观在 ./LocateCurrentButton
 *
 * 三个条件**同时**成立才显示，缺一不可：
 * 1. 当前曲在**已加载的**列表数据里找得到下标
 * 2. 该下标不在可视区内
 * 3. 用户刚滑过（滚动停止后还在停留时长内）
 *
 * 条件 1 顺带把分页列表兜住了：插件歌单翻到第 3 页时当前曲若还没加载进来，
 * 就找不到下标、浮标不出现——点了也滚不过去，不出现才是对的，不必按页面类型开白名单。
 * 条件 2 是本仓相对旧版加的：行高 63dp，竖屏一屏 9 行，轻滑一下当前曲往往还在屏上，
 * 那时冒出个「定位」只是噪音。
 *
 * 前两条合成一个布尔 `targetOffscreen` 而不是把可视区间交给调用方存，是**性能要求**：
 * 可视区间每次上报都在变，存进 state 会让列表在整个滚动期反复重渲染（见 useLocateCurrent）。
 */

/** 可视下标区间（闭区间），列表尚未上报过可视项时为 null */
export interface VisibleRange {
    first: number;
    last: number;
}

/**
 * 由 FlashList 上报的可视项算区间；一项都没有时为 null
 *
 * 直接吃「带 index 的对象」而不是先 map 出下标数组：这是滚动期每跨一行就要走一次的路径，
 * 没必要每次都分配一个临时数组
 */
export function visibleRangeOf(
    items: readonly { index?: number | null }[],
): VisibleRange | null {
    let first: number | null = null;
    let last: number | null = null;
    for (const { index } of items) {
        if (index == null) {
            continue;
        }
        if (first === null || index < first) {
            first = index;
        }
        if (last === null || index > last) {
            last = index;
        }
    }
    return first === null || last === null ? null : { first, last };
}

/** 下标是否落在可视区间内；区间未知时**视为可见**（宁可不显示，也不要在没依据时乱冒） */
export function isIndexVisible(
    index: number,
    range: VisibleRange | null,
): boolean {
    if (range === null) {
        return true;
    }
    return index >= range.first && index <= range.last;
}

/**
 * 浮标的前两个条件：有目标 **且** 目标不在可视区
 *
 * 注意是 `currentIndex === null` 而非 `!currentIndex`——列表第一首恰好是当前曲时
 * 下标就是 0，用真值判断会让那一首永远定位不到
 */
export function isTargetOffscreen(
    currentIndex: number | null,
    range: VisibleRange | null,
): boolean {
    if (currentIndex === null) {
        return false;
    }
    return !isIndexVisible(currentIndex, range);
}

/** 三条件合议（前两条已折进 targetOffscreen） */
export function shouldShowLocate({
    targetOffscreen,
    recentlyScrolled,
}: {
    targetOffscreen: boolean;
    recentlyScrolled: boolean;
}): boolean {
    return targetOffscreen && recentlyScrolled;
}

/** FlashList 的四个滚动起止事件 */
export type ScrollPhaseEvent =
    | 'dragBegin'
    | 'dragEnd'
    | 'momentumBegin'
    | 'momentumEnd';

/**
 * 滚动事件 → (是否算「刚滑过」, 是否起算停留计时)
 *
 * 抽成数据是为了能断言接线方向：把 begin 和 end 接反了，`startDwell` 的真假就会翻，
 * 而这件事在组件里是看不出来的——两个 handler 长得一模一样
 *
 * 计时从**滚动停止**起算而非从浮标出现起算：否则一次长甩就把停留时长吃掉了，
 * 手指刚松开它已经在淡出。dragEnd 排下的计时会被随后的 momentumBegin 清掉，
 * 由 momentumEnd 重新计满
 */
export function scrollPhaseEffect(event: ScrollPhaseEvent): {
    recentlyScrolled: boolean;
    startDwell: boolean;
} {
    switch (event) {
        case 'dragBegin':
        case 'momentumBegin':
            return { recentlyScrolled: true, startDwell: false };
        case 'dragEnd':
        case 'momentumEnd':
            return { recentlyScrolled: true, startDwell: true };
    }
}

/**
 * FlashList 的滚动 prop → 事件名
 *
 * 把**绑定本身**也做成数据，而不是在 hook 里写四个 `() => onScrollPhase('dragBegin')`：
 * 那四行长得一模一样，接反了看不出来、也测不出来（纯函数 `scrollPhaseEffect` 是对的，
 * 错的是谁调它）。做成表之后接反会在断言里红
 */
export const SCROLL_PHASE_PROPS = {
    onScrollBeginDrag: 'dragBegin',
    onScrollEndDrag: 'dragEnd',
    onMomentumScrollBegin: 'momentumBegin',
    onMomentumScrollEnd: 'momentumEnd',
} as const satisfies Record<string, ScrollPhaseEvent>;

/**
 * 按 key 建「key → 下标」表
 *
 * 不每次切歌都 O(n) 扫一遍：本地音乐可能几千首，而列表数据变化远比切歌稀疏，
 * 故按 data 建一次表、切歌时只查一次
 */
export function buildKeyIndex<T>(
    data: readonly T[],
    keyExtractor: (item: T, index: number) => string,
): ReadonlyMap<string, number> {
    const map = new Map<string, number>();
    data.forEach((item, index) => {
        const key = keyExtractor(item, index);
        // 首次出现者胜：同一首歌重复出现在列表里时，定位到第一处
        if (!map.has(key)) {
            map.set(key, index);
        }
    });
    return map;
}
