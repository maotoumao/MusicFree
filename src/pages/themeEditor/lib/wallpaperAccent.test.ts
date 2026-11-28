import { mixSrgb, resolveThemeColors } from '@/design';
import { colord } from '@/utils/color';

import { accentFollowsWallpaper, wallpaperAccent } from './wallpaperAccent';

import type { ThemeBackground, ThemePack } from '@/core/theme';

// 只为拿 core 的常量与类型：把 theme 单例的存储 / 文件依赖全部空置
jest.mock('@/infra/storage', () => ({
    getOrCreateMMKV: () => ({
        getAllKeys: () => [],
        addOnValueChangedListener: () => ({ remove: () => undefined }),
    }),
    getObject: () => undefined,
    getStoreVersion: () => 0,
    setObject: () => undefined,
    setStoreVersion: () => undefined,
}));
jest.mock('@/infra/paths', () => ({ basePath: '/base' }));
jest.mock('@dr.pogodin/react-native-fs', () => ({}));
// `@/design` 桶带进 motion 令牌，后者在模块加载时就调 reanimated 的 Easing；本测试只用纯色彩函数
jest.mock('react-native-reanimated', () => {
    const noop = () => undefined;
    return {
        Easing: { bezier: noop, out: noop, in: noop, cubic: noop },
    };
});

function pack(options?: Partial<ThemePack>): ThemePack {
    return {
        id: 'pack-1',
        name: '我的主题',
        scheme: 'dark',
        colors: {},
        background: null,
        autoContrast: true,
        ...options,
    };
}

function background(options?: Partial<ThemeBackground>): ThemeBackground {
    return {
        fileName: 'background-1.jpg',
        sourceFileName: 'source-1.jpg',
        blurRadius: 12,
        focusX: 0.5,
        focusY: 0.5,
        scale: 1,
        averageColor: '#405060',
        accentColor: null,
        visibility: 0.45,
        surfaceOpacity: 0.8,
        ...options,
    };
}

describe('由壁纸主色派生强调色', () => {
    it('壁纸没有主色就不给默认值', () => {
        expect(
            wallpaperAccent(pack(), {
                averageColor: '#808080',
                dominantColor: null,
            }),
        ).toBeNull();
    });

    it('主色在基底上本就够看时原样保留', () => {
        expect(
            wallpaperAccent(pack(), {
                averageColor: '#202020',
                dominantColor: '#ff8c1a',
            }),
        ).toBe('#ff8c1a');
    });

    it('深色主题 + 深壁纸：过暗的主色提亮到 3:1，色相不变', () => {
        const accent = wallpaperAccent(pack(), {
            averageColor: '#101820',
            dominantColor: '#203060',
        });

        expect(accent).not.toBeNull();
        // 基底 = 壁纸平均色与页面底按默认可见度 0.45 混（与 substrateColorAtom 同一条公式）
        const substrate = mixSrgb(
            '#101820',
            resolveThemeColors('dark', {}, null).background,
            0.55,
        );
        expect(colord(accent!).contrast(substrate)).toBeGreaterThanOrEqual(3);
        expect(Math.round(colord(accent!).toHsl().h)).toBe(
            Math.round(colord('#203060').toHsl().h),
        );
        expect(colord(accent!).luminance()).toBeGreaterThan(
            colord('#203060').luminance(),
        );
    });

    it('浅色主题 + 浅壁纸：过亮的主色压暗到够看', () => {
        const accent = wallpaperAccent(pack({ scheme: 'light' }), {
            averageColor: '#f0e8d8',
            dominantColor: '#f5d6a0',
        });

        expect(accent).not.toBeNull();
        const substrate = mixSrgb(
            '#f0e8d8',
            resolveThemeColors('light', {}, null).background,
            0.55,
        );
        expect(colord(accent!).contrast(substrate)).toBeGreaterThanOrEqual(3);
        expect(colord(accent!).luminance()).toBeLessThan(
            colord('#f5d6a0').luminance(),
        );
    });

    it('鲜绿基底：白字只有 2:1，得往深走才达标', () => {
        // 可见度 1：基底就是壁纸本身
        const accent = wallpaperAccent(
            pack({ background: background({ visibility: 1 }) }),
            { averageColor: '#00d000', dominantColor: '#00d000' },
        );

        expect(colord(accent!).contrast('#00d000')).toBeGreaterThanOrEqual(3);
        expect(colord(accent!).luminance()).toBeLessThan(
            colord('#00d000').luminance(),
        );
    });

    it('达标按量化后的 hex 判：全精度值在门槛边上收工会让落地色掉到 3:1 之下', () => {
        // 审查里的反例：纯色壁纸 #d5c492、可见度 1，按全精度判会给出 2.9977 的 #7f6b31
        const accent = wallpaperAccent(
            pack({ background: background({ visibility: 1 }) }),
            { averageColor: '#d5c492', dominantColor: '#d5c492' },
        );

        expect(colord(accent!).contrast('#d5c492')).toBeGreaterThanOrEqual(3);
    });

    it('基底按已有背景的可见度混，不取默认可见度', () => {
        const sampled = { averageColor: '#ffffff', dominantColor: '#c0c0ff' };
        // 可见度 0：基底就是深色页面底，淡紫够看、原样保留
        const veiled = wallpaperAccent(
            pack({ background: background({ visibility: 0 }) }),
            sampled,
        );
        // 可见度 1：基底就是纯白壁纸，淡紫得压暗
        const bare = wallpaperAccent(
            pack({ background: background({ visibility: 1 }) }),
            sampled,
        );

        expect(veiled).toBe('#c0c0ff');
        expect(colord(bare!).contrast('#ffffff')).toBeGreaterThanOrEqual(3);
    });
});

describe('强调色是否还跟着壁纸', () => {
    it('没自定义过：跟', () => {
        expect(accentFollowsWallpaper(undefined, null)).toBe(true);
        expect(accentFollowsWallpaper(undefined, background())).toBe(true);
    });

    it('等于上一张壁纸派生的默认值：跟', () => {
        expect(
            accentFollowsWallpaper(
                '#FF8C1A',
                background({ accentColor: '#FF8C1A' }),
            ),
        ).toBe(true);
    });

    it('用户自己改过：不跟', () => {
        expect(
            accentFollowsWallpaper(
                '#123456',
                background({ accentColor: '#FF8C1A' }),
            ),
        ).toBe(false);
        // 上一张壁纸没有主色、用户却设了强调色：那一定是他自己设的
        expect(accentFollowsWallpaper('#123456', background())).toBe(false);
        expect(accentFollowsWallpaper('#123456', null)).toBe(false);
    });
});
