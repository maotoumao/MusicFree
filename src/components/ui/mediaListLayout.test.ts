import { locateGutterFor, mediaRowContainerFor } from './mediaListLayout';

jest.mock('react-native', () => ({
    Dimensions: { get: jest.fn(), addEventListener: jest.fn() },
}));
jest.mock('@/design', () => ({
    layout: jest.requireActual('@/design/tokens/layout').layout,
    breakpoints: jest.requireActual('@/design/tokens/breakpoints').breakpoints,
}));

/** 旧的 640 居中容器——与 mediaListLayout 内的 LEGACY_ROW 同形 */
const LEGACY = {
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
};

describe('手机竖屏与适配前一致', () => {
    it.each([320, 360, 390, 412, 430])('竖屏 %ddp 不包容器', width => {
        expect(mediaRowContainerFor('phone', width, 844)).toBeUndefined();
    });
});

describe('矮窗（手机横屏）取消限宽', () => {
    // 真机横屏窗口：iPhone 12 / Pixel 6 / 用户机 1080×2340@480dpi
    it.each([
        [844, 390],
        [915, 412],
        [780, 360],
    ])('%d × %d 不包容器，行铺满可用宽', (width, height) => {
        expect(mediaRowContainerFor('phone', width, height)).toBeUndefined();
    });

    it('高度恰好到 480 就不算矮窗，仍包旧的 640 容器', () => {
        expect(mediaRowContainerFor('phone', 700, 480)).toEqual(LEGACY);
        expect(mediaRowContainerFor('phone', 700, 479)).toBeUndefined();
    });

    it('矮窗但不够宽时仍不包——两条判据都得过', () => {
        expect(mediaRowContainerFor('phone', 640, 360)).toBeUndefined();
        expect(mediaRowContainerFor('phone', 641, 360)).toBeUndefined();
        expect(mediaRowContainerFor('phone', 641, 500)).toEqual(LEGACY);
    });
});

describe('高窗宽屏手机仍包旧容器（分屏 / 折叠屏内屏一半）', () => {
    it.each([
        [700, 500],
        [800, 560],
    ])('%d × %d', (width, height) => {
        expect(mediaRowContainerFor('phone', width, height)).toEqual(LEGACY);
    });

    it('横屏刚好 640 不包（沿用旧的严格大于判定）', () => {
        expect(mediaRowContainerFor('phone', 640, 500)).toBeUndefined();
    });
});

describe('平板包内容列', () => {
    const COLUMN = {
        width: '100%',
        maxWidth: 904,
        alignSelf: 'center',
        paddingHorizontal: 16,
    };

    it.each(['tabletPortrait', 'tabletLandscape'] as const)(
        '%s：840 + 2×32，孩子自带 16 再补 16',
        layoutClass => {
            expect(mediaRowContainerFor(layoutClass, 1280, 800)).toEqual(
                COLUMN,
            );
        },
    );

    it('矮窗判据只作用于 phone 支——平板即使高度很矮也照包内容列', () => {
        expect(mediaRowContainerFor('tabletLandscape', 1280, 360)).toEqual(
            COLUMN,
        );
    });
});

describe('分栏页（inPane）不看窗口高', () => {
    it.each([360, 800])('高 %ddp 都按 listMaxWidth 兜底', height => {
        expect(mediaRowContainerFor('phone', 1280, height, true)).toEqual({
            width: '100%',
            maxWidth: 840,
            alignSelf: 'center',
        });
    });
});

describe('定位浮标的额外右内距（四档几何）', () => {
    /*
     * 这一组按「档位」而不是按数字来组织：浮标贴列表右缘、⋮ 贴行内容盒右缘，
     * 差值有两段（限宽留白 + 行容器内距）。只测得到手机 640 档的话，
     * 平板那两档漏算内距的 bug 检不出来——这正是本组存在的原因
     */
    it('行满幅（手机竖屏）：不必收，浮标就该贴列表右缘', () => {
        expect(locateGutterFor(undefined, 360)).toBe(0);
        expect(locateGutterFor(undefined, null)).toBe(0);
    });

    it('手机横屏 640 封顶：只有限宽留白，没有内距', () => {
        const row = mediaRowContainerFor('phone', 670, 500);
        // 670 → 每侧 15
        expect(locateGutterFor(row, 670)).toBe(15);
        // 780 → 每侧 70
        expect(locateGutterFor(row, 780)).toBe(70);
    });

    it('平板内容列 904 封顶：窗口没到 904 时留白为 0，但**内距 16 仍要算**', () => {
        const row = mediaRowContainerFor('tabletPortrait', 800, 1200);
        expect(row?.maxWidth).toBe(904);
        expect(row?.paddingHorizontal).toBe(16);
        // 800 < 904 → 留白 0，只剩内距
        expect(locateGutterFor(row, 800)).toBe(16);
        // 1000 > 904 → 留白 48 + 内距 16
        expect(locateGutterFor(row, 1000)).toBe(64);
    });

    it('平板分栏 840 封顶：同样含内距', () => {
        const row = mediaRowContainerFor('tabletLandscape', 1280, 800, true);
        expect(row?.maxWidth).toBe(840);
        expect(row?.paddingHorizontal).toBe(16);
        expect(locateGutterFor(row, 600)).toBe(16); // 栏比封顶窄 → 只有内距
        expect(locateGutterFor(row, 1000)).toBe(96); // 留白 80 + 内距 16
    });

    it('手机分栏（本地音乐横屏）：840 封顶但手机档不补内距', () => {
        const row = mediaRowContainerFor('phone', 780, 360, true);
        expect(row?.maxWidth).toBe(840);
        expect(row?.paddingHorizontal).toBeUndefined();
        expect(locateGutterFor(row, 380)).toBe(0);
    });

    it('还没量到列表宽时只算内距，不猜留白', () => {
        const tablet = mediaRowContainerFor('tabletPortrait', 1000, 1200);
        expect(locateGutterFor(tablet, null)).toBe(16);
        const phone = mediaRowContainerFor('phone', 780, 500);
        expect(locateGutterFor(phone, null)).toBe(0);
    });

    /*
     * 声明已知边界：只认 paddingRight / paddingHorizontal。
     * 注意**这条自己不会因行样式变更而红**（夹具是写死的）——真正会红的是上面
     * 按档位取真实行样式的那几条。这条的作用只是把边界写在代码里，
     * 让下一个改行内距的人看到「逻辑向内距不被识别」这件事
     */
    it('只认 paddingRight / paddingHorizontal 两个键（已知边界）', () => {
        expect(locateGutterFor({ paddingRight: 20 }, null)).toBe(20);
        expect(locateGutterFor({ paddingHorizontal: 12 }, null)).toBe(12);
        // paddingRight 优先于 paddingHorizontal
        expect(
            locateGutterFor({ paddingHorizontal: 12, paddingRight: 20 }, null),
        ).toBe(20);
        // 逻辑向内距**不认**——这是边界，不是期望行为
        expect(locateGutterFor({ paddingEnd: 20 }, null)).toBe(0);
    });

    it('留白不会算成负数（列表比封顶窄）', () => {
        const row = mediaRowContainerFor('phone', 780, 500);
        expect(locateGutterFor(row, 400)).toBe(0);
    });
});
