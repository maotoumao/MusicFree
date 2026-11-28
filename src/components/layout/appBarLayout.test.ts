import { layout } from '@/design';

import { appBarHeightFor, appBarRowStyleFor } from './appBarLayout';

jest.mock('react-native', () => ({
    Dimensions: { get: jest.fn(), addEventListener: jest.fn() },
}));
// 真 token 进真几何算法（iconButtonGeometry 不拖 reanimated / 图标表，无需替身）
jest.mock('@/design', () => ({
    layout: jest.requireActual('@/design/tokens/layout').layout,
    iconSize: jest.requireActual('@/design/tokens/iconSize').iconSize,
    breakpoints: jest.requireActual('@/design/tokens/breakpoints').breakpoints,
}));

describe('手机顶栏行样式不变', () => {
    it('phone 下无论是否传 contentWidth 都返回 undefined', () => {
        expect(appBarRowStyleFor('phone')).toBeUndefined();
        expect(appBarRowStyleFor('phone', 'reading')).toBeUndefined();
        expect(appBarRowStyleFor('phone', 'list')).toBeUndefined();
    });
});

describe('平板顶栏行', () => {
    it('分栏页（不传 contentWidth）只升内距、不限宽', () => {
        const style = appBarRowStyleFor('tabletLandscape');
        expect(style?.maxWidth).toBeUndefined();
        // 32 内容线 − 壳内留白 (44 − 20) / 2 = 20
        expect(style?.paddingHorizontal).toBe(20);
    });

    it('单列页与内容列同宽居中', () => {
        expect(appBarRowStyleFor('tabletPortrait', 'reading')).toEqual({
            paddingHorizontal: 20,
            width: '100%',
            maxWidth: 744,
            alignSelf: 'center',
        });
        expect(appBarRowStyleFor('tabletLandscape', 'list')?.maxWidth).toBe(
            904,
        );
    });
});

describe('顶栏行高两档', () => {
    it('非矮窗取 appBarHeight、矮窗取 appBarCompactHeight', () => {
        expect(appBarHeightFor(false)).toBe(layout.appBarHeight);
        expect(appBarHeightFor(true)).toBe(layout.appBarCompactHeight);
    });

    it('矮档确实更矮——否则这个分支没有意义', () => {
        expect(appBarHeightFor(true)).toBeLessThan(appBarHeightFor(false));
    });

    /*
     * 只钉命中区这一条：行内最高的子元素是 44 的 IconButton。
     * 标题**不传 lineHeight**（Text 在没给时交给原生字体度量），实测 25dp、恒低于 44，
     * 故它不是约束的那一条——拿 fontSize × lineHeightMultiplier 去算是个组件从不施加的公式，
     * 断言再多也只是 48 ≥ 22 这种恒真式
     */
    it('矮档仍装得下行内最高的子元素：44 的图标按钮命中区', () => {
        expect(appBarHeightFor(true)).toBeGreaterThanOrEqual(layout.hitTarget);
    });
});
