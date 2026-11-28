import { gridColumnsFor, gridColumnsWithoutOrphan } from './useGridColumns';

jest.mock('react-native', () => ({ useWindowDimensions: jest.fn() }));
jest.mock('@/design', () => ({ layout: { screenGutter: 16 } }));

/** 测纯计算而非 hook：列数只是宽度的函数，不必为每个宽度渲染一次组件 */
function columnsAt(width: number, ideal: number, min?: number): number {
    return gridColumnsFor(width, ideal, min);
}

/** 封面格：手机上今天是两列 */
const COVER_IDEAL = 200;
/** 主题卡：手机上今天是三列 */
const THEME_IDEAL = 120;

describe('手机上恒等于适配前的列数', () => {
    it.each([320, 360, 390, 412, 430])('封面格在 %ddp 上仍是两列', width => {
        expect(columnsAt(width, COVER_IDEAL)).toBe(2);
    });

    it.each([320, 360, 390, 412, 430])('主题卡在 %ddp 上仍是三列', width => {
        expect(columnsAt(width, THEME_IDEAL, 3)).toBe(3);
    });
});

describe('宽屏加列', () => {
    it('平板竖屏 834dp 的封面格给四列', () => {
        expect(columnsAt(834, COVER_IDEAL)).toBe(4);
    });

    it('平板横屏 1194dp 的封面格给六列', () => {
        expect(columnsAt(1194, COVER_IDEAL)).toBe(6);
    });

    it('列数随宽度单调不减——折叠屏展开途中不该忽多忽少', () => {
        let previous = 0;
        for (let width = 320; width <= 1280; width += 8) {
            const columns = columnsAt(width, COVER_IDEAL);
            expect(columns).toBeGreaterThanOrEqual(previous);
            previous = columns;
        }
    });
});

describe('下限', () => {
    it('极窄机也不塌成单列', () => {
        expect(columnsAt(240, COVER_IDEAL)).toBe(2);
    });
});

describe('不出末行孤卡', () => {
    it('4 张卡：算出 3 列收到 2 列，算出 4 / 5 列取 4', () => {
        expect(gridColumnsWithoutOrphan(3, 4)).toBe(2);
        expect(gridColumnsWithoutOrphan(4, 4)).toBe(4);
        expect(gridColumnsWithoutOrphan(5, 4)).toBe(4);
    });

    it('2 张卡恒 2 列；卡少于列数时按卡数', () => {
        expect(gridColumnsWithoutOrphan(3, 2)).toBe(2);
        expect(gridColumnsWithoutOrphan(6, 4)).toBe(4);
    });

    it('不足两张或不足两列时原样返回', () => {
        expect(gridColumnsWithoutOrphan(3, 0)).toBe(3);
        expect(gridColumnsWithoutOrphan(3, 1)).toBe(3);
        expect(gridColumnsWithoutOrphan(1, 4)).toBe(1);
    });

    it('质数张（5、3）找不到整除列数时原样返回', () => {
        expect(gridColumnsWithoutOrphan(2, 5)).toBe(2);
        expect(gridColumnsWithoutOrphan(3, 5)).toBe(3);
        expect(gridColumnsWithoutOrphan(2, 3)).toBe(2);
    });
});
