import {
    buildKeyIndex,
    isIndexVisible,
    isTargetOffscreen,
    scrollPhaseEffect,
    shouldShowLocate,
    visibleRangeOf,
    SCROLL_PHASE_PROPS,
} from './locateRules';

const RANGE = { first: 10, last: 14 };

describe('可视区判定', () => {
    it('闭区间：两端都算可见', () => {
        expect(isIndexVisible(10, RANGE)).toBe(true);
        expect(isIndexVisible(14, RANGE)).toBe(true);
    });

    it('区间外不可见', () => {
        expect(isIndexVisible(9, RANGE)).toBe(false);
        expect(isIndexVisible(15, RANGE)).toBe(false);
    });

    it('区间未知时视为可见——没依据时不冒浮标', () => {
        expect(isIndexVisible(0, null)).toBe(true);
        expect(isIndexVisible(9999, null)).toBe(true);
    });
});

describe('由上报的可视项算区间', () => {
    /** 与 FlashList 的 ViewToken 同形，只取判定用得到的 index */
    const tokens = (...indices: (number | null | undefined)[]) =>
        indices.map(index => ({ index }));

    it('取最小与最大，不假定上报是有序的', () => {
        expect(visibleRangeOf(tokens(7, 3, 5, 4, 6))).toEqual({
            first: 3,
            last: 7,
        });
    });

    it('单项时首尾相同', () => {
        expect(visibleRangeOf(tokens(8))).toEqual({ first: 8, last: 8 });
    });

    it('跳过 null / undefined 的下标（ViewToken.index 可空）', () => {
        expect(visibleRangeOf(tokens(null, 4, undefined, 9))).toEqual({
            first: 4,
            last: 9,
        });
    });

    it('一项都没有（含全是空下标）→ null，而不是 0..0', () => {
        expect(visibleRangeOf([])).toBeNull();
        expect(visibleRangeOf(tokens(null, undefined))).toBeNull();
    });

    it('下标 0 参与计算，不被当成空值', () => {
        expect(visibleRangeOf(tokens(0, 2))).toEqual({ first: 0, last: 2 });
        expect(visibleRangeOf(tokens(0))).toEqual({ first: 0, last: 0 });
    });
});

describe('目标在不在可视区外', () => {
    it('没有目标 → 不算在外（浮标没东西可定位）', () => {
        expect(isTargetOffscreen(null, RANGE)).toBe(false);
        expect(isTargetOffscreen(null, null)).toBe(false);
    });

    it('目标在区间内 → 不算在外', () => {
        expect(isTargetOffscreen(12, RANGE)).toBe(false);
    });

    it('目标在区间外 → 算在外', () => {
        expect(isTargetOffscreen(3, RANGE)).toBe(true);
        expect(isTargetOffscreen(99, RANGE)).toBe(true);
    });

    /*
     * 下标 0 单独钉：判据必须是 `currentIndex === null` 而不是 `!currentIndex`。
     * 写成真值判断时下面第一条会挂——列表第一首恰好是当前曲时浮标永远不出现，
     * 而这是个很常见的情形（刚进页面点第一首）
     */
    it('下标 0 是合法目标：在区间外要算在外，在区间内要算在内', () => {
        expect(isTargetOffscreen(0, { first: 5, last: 9 })).toBe(true);
        expect(isTargetOffscreen(0, { first: 0, last: 4 })).toBe(false);
    });

    /*
     * 「有合法目标 + 区间还未知」这一格必须钉：漏了它，把判据写成
     * `if (range === null) return currentIndex !== null` 的变异能存活——
     * 那会让列表刚挂载、还没上报过可视项时浮标就冒出来
     */
    it('有目标但区间未知 → 不算在外（保守缺省，别在没依据时冒浮标）', () => {
        expect(isTargetOffscreen(0, null)).toBe(false);
        expect(isTargetOffscreen(7, null)).toBe(false);
    });
});

describe('两条件合议（第一条「有目标」已折进 targetOffscreen）', () => {
    it('两条都成立才显示', () => {
        expect(
            shouldShowLocate({ targetOffscreen: true, recentlyScrolled: true }),
        ).toBe(true);
    });

    it('目标可见（或没有目标）→ 不显示，哪怕正在滑', () => {
        expect(
            shouldShowLocate({
                targetOffscreen: false,
                recentlyScrolled: true,
            }),
        ).toBe(false);
    });

    it('没在滑 → 不显示，哪怕目标在视野外', () => {
        expect(
            shouldShowLocate({
                targetOffscreen: true,
                recentlyScrolled: false,
            }),
        ).toBe(false);
    });

    it('两条都不成立 → 不显示', () => {
        expect(
            shouldShowLocate({
                targetOffscreen: false,
                recentlyScrolled: false,
            }),
        ).toBe(false);
    });
});

describe('滚动事件 → 停留计时的接线方向', () => {
    /*
     * 这一组存在的理由：begin 与 end 两个 handler 在组件里长得一模一样，
     * 接反了看不出来、渲染也不报错。把映射抽成数据后，接反就会在这里红
     */
    it('开始滑（拖拽 / 惯性）：算刚滑过，但不起算停留', () => {
        expect(scrollPhaseEffect('dragBegin')).toEqual({
            recentlyScrolled: true,
            startDwell: false,
        });
        expect(scrollPhaseEffect('momentumBegin')).toEqual({
            recentlyScrolled: true,
            startDwell: false,
        });
    });

    it('滑动停下（拖拽结束 / 惯性结束）：起算停留', () => {
        expect(scrollPhaseEffect('dragEnd')).toEqual({
            recentlyScrolled: true,
            startDwell: true,
        });
        expect(scrollPhaseEffect('momentumEnd')).toEqual({
            recentlyScrolled: true,
            startDwell: true,
        });
    });

    it('四个事件都让浮标保持可见——淡出只由计时器结算，不由事件直接关', () => {
        const events = [
            'dragBegin',
            'dragEnd',
            'momentumBegin',
            'momentumEnd',
        ] as const;
        for (const event of events) {
            expect(scrollPhaseEffect(event).recentlyScrolled).toBe(true);
        }
    });

    it('begin 与 end 在 startDwell 上必须相反，否则就是接反了', () => {
        expect(scrollPhaseEffect('dragBegin').startDwell).toBe(
            !scrollPhaseEffect('dragEnd').startDwell,
        );
        expect(scrollPhaseEffect('momentumBegin').startDwell).toBe(
            !scrollPhaseEffect('momentumEnd').startDwell,
        );
    });
});

describe('key → 下标表', () => {
    const keyOf = (item: { k: string }) => item.k;

    it('按顺序建表', () => {
        const map = buildKeyIndex([{ k: 'a' }, { k: 'b' }, { k: 'c' }], keyOf);
        expect(map.get('a')).toBe(0);
        expect(map.get('b')).toBe(1);
        expect(map.get('c')).toBe(2);
    });

    it('查不到的 key 得 undefined，不是 -1', () => {
        expect(buildKeyIndex([{ k: 'a' }], keyOf).get('zzz')).toBeUndefined();
    });

    it('同一首重复出现时定位到第一处', () => {
        const map = buildKeyIndex(
            [{ k: 'a' }, { k: 'dup' }, { k: 'b' }, { k: 'dup' }],
            keyOf,
        );
        expect(map.get('dup')).toBe(1);
    });

    it('空列表得空表', () => {
        expect(buildKeyIndex([], keyOf).size).toBe(0);
    });

    it('keyExtractor 拿得到下标（与 FlashList 的签名一致）', () => {
        const map = buildKeyIndex(
            [{ k: 'x' }, { k: 'x' }],
            (item: { k: string }, index: number) => `${item.k}-${index}`,
        );
        expect(map.get('x-0')).toBe(0);
        expect(map.get('x-1')).toBe(1);
    });
});

describe('滚动 prop → 事件名的绑定表', () => {
    /*
     * 这一组钉的是**绑定方向**。hook 按这张表生成四个 handler，所以把任意一项接反
     * （如 onScrollBeginDrag 指到 'dragEnd'）会在这里红，而不是只能靠肉眼看那四行
     */
    it('四个 prop 各自指向对应的事件', () => {
        expect(SCROLL_PHASE_PROPS).toEqual({
            onScrollBeginDrag: 'dragBegin',
            onScrollEndDrag: 'dragEnd',
            onMomentumScrollBegin: 'momentumBegin',
            onMomentumScrollEnd: 'momentumEnd',
        });
    });

    it('prop 名与事件名在「起 / 止」和「拖拽 / 惯性」两个维度上都对得上', () => {
        for (const [prop, event] of Object.entries(SCROLL_PHASE_PROPS)) {
            // 起止：onScrollBeginDrag ↔ dragBegin（prop 名里的 Begin 不在词尾，故用 includes）
            expect(prop.includes('Begin')).toBe(event.endsWith('Begin'));
            expect(prop.includes('End')).toBe(event.endsWith('End'));
            // 家族：Momentum 的 prop 只能指到 momentum* 事件
            expect(prop.includes('Momentum')).toBe(
                event.startsWith('momentum'),
            );
        }
    });

    it('只有「止」那一类起算停留计时', () => {
        for (const [prop, event] of Object.entries(SCROLL_PHASE_PROPS)) {
            expect(scrollPhaseEffect(event).startDwell).toBe(
                prop.includes('End'),
            );
        }
    });

    it('四个事件被一一覆盖，没有重复也没有遗漏', () => {
        const events = Object.values(SCROLL_PHASE_PROPS);
        expect(new Set(events).size).toBe(events.length);
        expect(new Set(events)).toEqual(
            new Set(['dragBegin', 'dragEnd', 'momentumBegin', 'momentumEnd']),
        );
    });
});
