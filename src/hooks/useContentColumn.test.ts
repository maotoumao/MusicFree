import {
    contentColumnStyleFor,
    contentGutterFor,
    gutterExtraFor,
} from './useContentColumn';

jest.mock('react-native', () => ({
    Dimensions: { get: jest.fn(), addEventListener: jest.fn() },
}));
jest.mock('@/design', () => ({
    layout: jest.requireActual('@/design/tokens/layout').layout,
    breakpoints: jest.requireActual('@/design/tokens/breakpoints').breakpoints,
}));

describe('手机上什么都不加', () => {
    it.each(['reading', 'list'] as const)(
        '%s 列在 phone 下返回 undefined',
        kind => {
            expect(contentColumnStyleFor(kind, 'phone')).toBeUndefined();
            expect(
                contentColumnStyleFor(kind, 'phone', { gutter: 'self' }),
            ).toBeUndefined();
        },
    );
});

describe('平板两档同一套值', () => {
    it('reading 列：680 + 2×32，孩子自带 16 时只补 16', () => {
        expect(contentColumnStyleFor('reading', 'tabletPortrait')).toEqual({
            width: '100%',
            maxWidth: 744,
            alignSelf: 'center',
            paddingHorizontal: 16,
        });
        expect(contentColumnStyleFor('reading', 'tabletLandscape')).toEqual(
            contentColumnStyleFor('reading', 'tabletPortrait'),
        );
    });

    it('list 列：840 + 2×32', () => {
        expect(contentColumnStyleFor('list', 'tabletLandscape')?.maxWidth).toBe(
            904,
        );
    });

    it('容器自管内容线时直接给 32', () => {
        expect(
            contentColumnStyleFor('list', 'tabletPortrait', { gutter: 'self' })
                ?.paddingHorizontal,
        ).toBe(32);
    });
});

describe('内容线两个纯函数', () => {
    it('手机恒 undefined', () => {
        expect(contentGutterFor('phone')).toBeUndefined();
        expect(gutterExtraFor('phone')).toBeUndefined();
    });

    it.each(['tabletPortrait', 'tabletLandscape'] as const)(
        '%s：内容线 32、补差额 16',
        layoutClass => {
            expect(contentGutterFor(layoutClass)).toEqual({
                paddingHorizontal: 32,
            });
            expect(gutterExtraFor(layoutClass)).toEqual({
                paddingHorizontal: 16,
            });
        },
    );
});
