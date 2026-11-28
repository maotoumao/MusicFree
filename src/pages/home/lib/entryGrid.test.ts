import {
    entryGridColumnsFor,
    entryGridKeyFor,
    entryGridWidthFor,
} from './entryGrid';

jest.mock('react-native', () => ({
    Dimensions: { get: jest.fn(), addEventListener: jest.fn() },
}));
jest.mock('@/design', () => ({
    layout: jest.requireActual('@/design/tokens/layout').layout,
    breakpoints: jest.requireActual('@/design/tokens/breakpoints').breakpoints,
}));

/** Android 四张（本地音乐 / 下载 / 榜单 / 推荐歌单）；iOS 少掉带平台条件的两张 */
const ANDROID_CARDS = 4;

describe('手机竖屏与适配前一致', () => {
    it.each([320, 360, 390, 412, 430])('%ddp 恒两列', width => {
        expect(entryGridColumnsFor(width, ANDROID_CARDS)).toBe(2);
    });
});

describe('矮窗取消限宽后四张卡收成一行', () => {
    it('限宽 640 档：算出 3 列、被孤卡规则收成 2 列 → 两行', () => {
        expect(entryGridColumnsFor(640, ANDROID_CARDS)).toBe(2);
    });

    it.each([780, 844, 915])('铺满 %ddp 后 4 列 → 一行', gridWidth => {
        expect(entryGridColumnsFor(gridWidth, ANDROID_CARDS)).toBe(4);
    });

    it('收益是实打实少一行，不是列数变了而行数没变', () => {
        const capped = entryGridColumnsFor(640, ANDROID_CARDS);
        const full = entryGridColumnsFor(780, ANDROID_CARDS);
        expect(Math.ceil(ANDROID_CARDS / capped)).toBe(2);
        expect(Math.ceil(ANDROID_CARDS / full)).toBe(1);
    });
});

describe('张数变化不产生末行孤卡', () => {
    /*
     * 直接钉列数，不写「整除或列数≥张数」这种带逃生口的断言——
     * 780dp 下 2/3/4 张都满足 `columns >= count`，那条恒真、测不出孤卡规则被删掉
     */
    it.each([
        [2, 2],
        [3, 3],
        [4, 4],
    ])('780dp 下 %d 张排成 %d 列（一行排满）', (count, expected) => {
        expect(entryGridColumnsFor(780, count)).toBe(expected);
    });

    it('限宽 640 档下 4 张被收成 2 列，而不是留一张孤卡在第二行', () => {
        // 裸算出来是 3 列 → 4 张会是 3 + 1；孤卡规则把它收成 2 + 2
        expect(entryGridColumnsFor(640, 4)).toBe(2);
    });
});

describe('实测宽只在量它时那一档里作数', () => {
    /*
     * 实测值**不能**由估值公式推出来，否则「采信实测」那条断言两边恒等、测不出
     * 「完全忽略实测、永远返回估值」这个变异。故这里全部用与估值明确不同的宽：
     * 692 取自本地音乐分栏右区的线上实宽，775 模拟 Yoga 取整后比估值窄一点
     */
    const landscapeKey = entryGridKeyFor(780, true);
    const portraitKey = entryGridKeyFor(360, false);

    it('同一档内采信实测，而不是回落到估值', () => {
        // 估值是 780，实测 692 → 必须拿 692
        expect(
            entryGridWidthFor(780, true, {
                width: 692,
                layoutKey: landscapeKey,
            }),
        ).toBe(692);
        // 估值是 360，实测 352 → 必须拿 352
        expect(
            entryGridWidthFor(360, false, {
                width: 352,
                layoutKey: portraitKey,
            }),
        ).toBe(352);
        // 非矮窗宽窗：估值被 640 封顶，实测 775 仍以实测为准
        expect(
            entryGridWidthFor(780, false, {
                width: 775,
                layoutKey: entryGridKeyFor(780, false),
            }),
        ).toBe(775);
    });

    it('旋转后旧实测被丢弃，立刻用新档的估值', () => {
        // 竖屏量到 352，转横屏后档变了 → 不能再用 352，要用横屏估值 780
        const stale = { width: 352, layoutKey: portraitKey };
        expect(entryGridWidthFor(780, true, stale)).toBe(780);
        // 横→竖同理：横屏量到 692，回竖屏要用 360
        expect(
            entryGridWidthFor(360, false, {
                width: 692,
                layoutKey: landscapeKey,
            }),
        ).toBe(360);
    });

    it('这正是它要防的那一跳：丢弃与不丢弃算出的列数确实不同', () => {
        const stale = { width: 352, layoutKey: portraitKey };
        // 不丢弃 → 拿 352 去算 → 2 列（旧档的排布）
        expect(entryGridColumnsFor(stale.width, 4)).toBe(2);
        // 丢弃 → 拿新档估值 780 → 4 列
        expect(
            entryGridColumnsFor(entryGridWidthFor(780, true, stale), 4),
        ).toBe(4);
    });

    it('没有实测时按当前档估值（首次挂载）', () => {
        expect(entryGridWidthFor(780, true, null)).toBe(780);
        expect(entryGridWidthFor(360, false, null)).toBe(360);
        // 非矮窗的宽窗仍吃 640 封顶
        expect(entryGridWidthFor(780, false, null)).toBe(640);
    });

    it('档标识把「可用宽」与「限宽档」都算进去，缺一不可', () => {
        expect(entryGridKeyFor(780, true)).not.toBe(
            entryGridKeyFor(780, false),
        );
        expect(entryGridKeyFor(780, true)).not.toBe(entryGridKeyFor(779, true));
        // 同输入同标识：实测才能跨帧继续作数
        expect(entryGridKeyFor(780, true)).toBe(landscapeKey);
    });
});
