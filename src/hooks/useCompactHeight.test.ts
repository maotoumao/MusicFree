import { breakpoints } from '@/design';

import { isCompactHeight } from './useCompactHeight';
import { layoutClassFor } from './useLayoutClass';

jest.mock('react-native', () => ({
    Dimensions: { get: jest.fn(), addEventListener: jest.fn() },
}));
jest.mock('@/design', () => ({
    breakpoints: jest.requireActual('@/design/tokens/breakpoints').breakpoints,
}));

describe('矮窗判据与尺寸类正交', () => {
    it('阈值是严格小于 480', () => {
        expect(isCompactHeight(479)).toBe(true);
        expect(isCompactHeight(480)).toBe(false);
        expect(isCompactHeight(481)).toBe(false);
    });

    it.each([
        [780, 360],
        [844, 390],
        [915, 412],
    ])('手机横屏 %d × %d：既是 phone 又是矮窗', (width, height) => {
        expect(layoutClassFor(width, height)).toBe('phone');
        expect(isCompactHeight(height)).toBe(true);
    });

    it.each([
        [360, 780],
        [412, 915],
    ])('手机竖屏 %d × %d：是 phone 但不是矮窗', (width, height) => {
        expect(layoutClassFor(width, height)).toBe('phone');
        expect(isCompactHeight(height)).toBe(false);
    });

    it('平板横屏不是矮窗——两问答案这里才一致', () => {
        expect(layoutClassFor(1280, 800)).toBe('tabletLandscape');
        expect(isCompactHeight(800)).toBe(false);
    });

    it('「矮窗 ⇒ phone」由两个 token 的大小关系保证，不是巧合', () => {
        // 矮窗即高 < compactHeight；平板要求最小边 ≥ tabletMinEdge。
        // compactHeight <= tabletMinEdge 时矮窗的高必然够不上平板门槛 → 必是 phone。
        // 这条关系被打破（有人把 compactHeight 调到 600 以上）时本断言先红
        expect(breakpoints.compactHeight).toBeLessThanOrEqual(
            breakpoints.tabletMinEdge,
        );
        // 取最刁钻的一点：高度差一点点就进平板门槛，仍不是矮窗
        expect(isCompactHeight(breakpoints.tabletMinEdge - 1)).toBe(false);
    });
});
