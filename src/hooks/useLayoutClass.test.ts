import { layoutClassFor } from './useLayoutClass';

jest.mock('react-native', () => ({
    Dimensions: { get: jest.fn(), addEventListener: jest.fn() },
}));
jest.mock('@/design', () => ({
    breakpoints: jest.requireActual('@/design/tokens/breakpoints').breakpoints,
}));

describe('手机任何朝向都是 phone', () => {
    it.each([320, 360, 390, 412, 430])('%ddp 竖屏', width => {
        expect(layoutClassFor(width, 844)).toBe('phone');
    });

    it.each([320, 360, 390, 412, 430])('横屏、最小边 %ddp', width => {
        expect(layoutClassFor(844, width)).toBe('phone');
    });

    it('手机分屏一半', () => {
        expect(layoutClassFor(412, 450)).toBe('phone');
    });

    it('折叠屏外屏（Galaxy Z Fold）', () => {
        expect(layoutClassFor(360, 920)).toBe('phone');
    });

    it('翻盖机外屏（Galaxy Z Flip）', () => {
        expect(layoutClassFor(375, 390)).toBe('phone');
    });
});

describe('平板按宽高比分竖横', () => {
    it('Pixel Tablet 竖 / 横', () => {
        expect(layoutClassFor(800, 1280)).toBe('tabletPortrait');
        expect(layoutClassFor(1280, 800)).toBe('tabletLandscape');
    });

    it('Galaxy Z Fold 展开 / 展开后旋转', () => {
        expect(layoutClassFor(775, 930)).toBe('tabletPortrait');
        expect(layoutClassFor(930, 775)).toBe('tabletLandscape');
    });

    it('Pixel Fold 展开默认横宽', () => {
        expect(layoutClassFor(840, 700)).toBe('tabletLandscape');
    });

    it('平板分屏一半', () => {
        expect(layoutClassFor(640, 800)).toBe('tabletPortrait');
    });

    it('iPad 10.9 竖屏', () => {
        expect(layoutClassFor(820, 1180)).toBe('tabletPortrait');
    });

    it('正方形窗口按横屏处理', () => {
        expect(layoutClassFor(700, 700)).toBe('tabletLandscape');
    });

    it('阈值边界：599 是手机、600 是平板', () => {
        expect(layoutClassFor(599, 1000)).toBe('phone');
        expect(layoutClassFor(600, 1000)).toBe('tabletPortrait');
    });
});
