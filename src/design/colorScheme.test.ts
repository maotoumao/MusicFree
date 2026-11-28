import { getDefaultStore } from 'jotai';

import { colord } from '@/utils/color';

import {
    backgroundLayerAtom,
    chromeColorAtom,
    chromeIsDarkAtom,
    colorSchemeAtom,
    colorsAtom,
    hasBackgroundLayerAtom,
    setThemePreview,
    setThemeRuntime,
    substrateColorAtom,
    substrateIsDarkAtom,
    substrateTextContrastAtom,
    textShadowAtom,
} from './colorScheme';
import { darkColors, lightColors } from './tokens/colors';
import { pageFadeAtom } from './usePageFade';

import type {
    ThemeBackgroundLayer,
    ThemePackRuntime,
    ThemeRuntime,
    ThemeSelectionRuntime,
} from './colorScheme';

const LIGHT_PACK = 'light';
const DARK_PACK = 'dark';

function pack(
    id: string,
    overrides?: Partial<Omit<ThemePackRuntime, 'id'>>,
): ThemePackRuntime {
    return {
        id,
        scheme: id === DARK_PACK ? 'dark' : 'light',
        colors: {},
        background: null,
        autoContrast: true,
        ...overrides,
    };
}

function background(
    overrides?: Partial<ThemeBackgroundLayer>,
): ThemeBackgroundLayer {
    return {
        uri: 'file:///base/theme-background/background-1.jpg',
        visibility: 0.5,
        surfaceOpacity: 0.8,
        averageColor: '#808080',
        ...overrides,
    };
}

function runtime(
    selection: ThemeSelectionRuntime,
    packs: readonly ThemePackRuntime[] = [pack(LIGHT_PACK), pack(DARK_PACK)],
): ThemeRuntime {
    return { packs, selection };
}

const FOLLOW_SYSTEM: ThemeSelectionRuntime = {
    kind: 'system',
    dayPackId: LIGHT_PACK,
    nightPackId: DARK_PACK,
};

let mockSystemScheme: 'light' | 'dark' | null = 'light';
let mockAppearanceListener:
    | ((event: { colorScheme: 'light' | 'dark' | null }) => void)
    | undefined;
const mockRemoveAppearanceListener = jest.fn();

jest.mock('react-native', () => ({
    Appearance: {
        getColorScheme: () => mockSystemScheme,
        addChangeListener: jest.fn(
            (
                listener: (event: {
                    colorScheme: 'light' | 'dark' | null;
                }) => void,
            ) => {
                mockAppearanceListener = event => {
                    mockSystemScheme = event.colorScheme;
                    listener(event);
                };
                return { remove: mockRemoveAppearanceListener };
            },
        ),
    },
}));

const store = getDefaultStore();

beforeEach(() => {
    mockSystemScheme = 'light';
    mockAppearanceListener = undefined;
    mockRemoveAppearanceListener.mockClear();
    setThemePreview(undefined);
    // 让 systemColorSchemeAtom 重新挂载并同步回 light：它只在获得订阅者时重读系统值，
    // 否则上一个用例经监听改过的值会留到下一个用例
    store.sub(colorSchemeAtom, () => {})();
    mockRemoveAppearanceListener.mockClear();
    setThemeRuntime(runtime(FOLLOW_SYSTEM));
});

describe('主题选择', () => {
    it('跟随系统按 Appearance 取时段主题，null 按浅色处理', () => {
        const unsubscribe = store.sub(colorSchemeAtom, () => {});
        expect(store.get(colorSchemeAtom)).toBe('light');

        mockAppearanceListener?.({ colorScheme: 'dark' });
        expect(store.get(colorSchemeAtom)).toBe('dark');

        mockAppearanceListener?.({ colorScheme: null });
        expect(store.get(colorSchemeAtom)).toBe('light');
        unsubscribe();
        expect(mockRemoveAppearanceListener).toHaveBeenCalledTimes(1);
    });

    it('固定主题不受系统变化影响', () => {
        setThemeRuntime(runtime({ kind: 'fixed', packId: DARK_PACK }));
        const unsubscribe = store.sub(colorSchemeAtom, () => {});

        expect(store.get(colorSchemeAtom)).toBe('dark');
        mockAppearanceListener?.({ colorScheme: 'light' });
        expect(store.get(colorSchemeAtom)).toBe('dark');
        unsubscribe();
    });

    it('从固定切回跟随系统后恢复跟随', () => {
        const unsubscribe = store.sub(colorSchemeAtom, () => {});
        mockAppearanceListener?.({ colorScheme: 'dark' });
        expect(store.get(colorSchemeAtom)).toBe('dark');

        setThemeRuntime(runtime({ kind: 'fixed', packId: LIGHT_PACK }));
        expect(store.get(colorSchemeAtom)).toBe('light');

        setThemeRuntime(runtime(FOLLOW_SYSTEM));
        expect(store.get(colorSchemeAtom)).toBe('dark');
        unsubscribe();
    });

    it('选择指向不存在的主题时回落系统明暗的空主题', () => {
        setThemeRuntime(runtime({ kind: 'fixed', packId: 'gone' }));

        expect(store.get(colorSchemeAtom)).toBe('light');
        expect(store.get(colorsAtom)).toEqual(lightColors);
        expect(store.get(hasBackgroundLayerAtom)).toBe(false);
    });
});

describe('生效配色', () => {
    it('无覆盖时完整保留浅深默认表', () => {
        setThemeRuntime(runtime({ kind: 'fixed', packId: LIGHT_PACK }));
        expect(store.get(colorsAtom)).toEqual(lightColors);

        setThemeRuntime(runtime({ kind: 'fixed', packId: DARK_PACK }));
        expect(store.get(colorsAtom)).toEqual(darkColors);
    });

    it('主题覆盖直接生效，并带出派生结果', () => {
        setThemeRuntime(
            runtime({ kind: 'fixed', packId: LIGHT_PACK }, [
                pack(LIGHT_PACK, { colors: { primary: '#2563EB' } }),
            ]),
        );

        const colors = store.get(colorsAtom);
        expect(colors.primary).toBe('#2563EB');
        expect(colors.primarySoft).not.toBe(lightColors.primarySoft);
        expect(colord(colors.primarySoft).alpha()).toBeCloseTo(0.12, 2);
    });

    it('相同投影不重复发布', () => {
        const listener = jest.fn();
        const unsubscribe = store.sub(colorsAtom, listener);
        // 订阅本身会挂载系统明暗监听并同步一次，从这之后才开始计数
        listener.mockClear();

        setThemeRuntime(runtime(FOLLOW_SYSTEM));
        setThemeRuntime(runtime(FOLLOW_SYSTEM));

        expect(listener).not.toHaveBeenCalled();
        unsubscribe();
    });
});

describe('背景图层', () => {
    it('背景随生效主题给出，并驱动半透明面', () => {
        setThemeRuntime(
            runtime({ kind: 'fixed', packId: LIGHT_PACK }, [
                pack(LIGHT_PACK, { background: background() }),
            ]),
        );

        expect(store.get(hasBackgroundLayerAtom)).toBe(true);
        expect(store.get(backgroundLayerAtom)?.visibility).toBe(0.5);
        expect(colord(store.get(colorsAtom).surface).alpha()).toBeCloseTo(
            0.8,
            2,
        );
    });

    it('草稿覆盖持久投影，清除后恢复', () => {
        setThemeRuntime(
            runtime({ kind: 'fixed', packId: LIGHT_PACK }, [
                pack(LIGHT_PACK, { background: background() }),
            ]),
        );

        setThemePreview(
            pack(LIGHT_PACK, {
                background: background({ uri: null, visibility: 0.2 }),
            }),
        );
        expect(store.get(backgroundLayerAtom)).toEqual(
            expect.objectContaining({ uri: null, visibility: 0.2 }),
        );

        setThemePreview(undefined);
        expect(store.get(backgroundLayerAtom)?.visibility).toBe(0.5);
    });

    it('基底色按可见度在壁纸平均色与幕布之间逐通道混合', () => {
        setThemeRuntime(
            runtime({ kind: 'fixed', packId: DARK_PACK }, [
                pack(DARK_PACK, {
                    background: background({
                        visibility: 1,
                        averageColor: '#F0F0F0',
                    }),
                }),
            ]),
        );
        expect(store.get(substrateColorAtom)).toBe('#f0f0f0');
        expect(store.get(substrateIsDarkAtom)).toBe(false);

        setThemeRuntime(
            runtime({ kind: 'fixed', packId: DARK_PACK }, [
                pack(DARK_PACK, {
                    background: background({
                        visibility: 0,
                        averageColor: '#F0F0F0',
                    }),
                }),
            ]),
        );
        expect(store.get(substrateColorAtom)).toBe(darkColors.background);
        expect(store.get(substrateIsDarkAtom)).toBe(true);

        setThemeRuntime(
            runtime({ kind: 'fixed', packId: LIGHT_PACK }, [
                pack(LIGHT_PACK, {
                    background: background({
                        visibility: 0.5,
                        averageColor: '#000000',
                    }),
                }),
            ]),
        );
        // 幕布 #fafafa 以 50% 压在纯黑壁纸上：sRGB 逐通道取中点
        expect(store.get(substrateColorAtom)).toBe('#7d7d7d');
    });
});

describe('文字自适配', () => {
    it('无背景或开关关闭时不给阴影', () => {
        setThemeRuntime(runtime({ kind: 'fixed', packId: LIGHT_PACK }));
        expect(store.get(textShadowAtom)).toBeUndefined();

        setThemeRuntime(
            runtime({ kind: 'fixed', packId: DARK_PACK }, [
                pack(DARK_PACK, {
                    autoContrast: false,
                    background: background({
                        visibility: 1,
                        averageColor: '#F2F2F2',
                    }),
                }),
            ]),
        );
        expect(store.get(textShadowAtom)).toBeUndefined();
    });

    it('正文压在同向亮度的背景上时给出反向阴影', () => {
        setThemeRuntime(
            runtime({ kind: 'fixed', packId: DARK_PACK }, [
                pack(DARK_PACK, {
                    background: background({
                        visibility: 1,
                        averageColor: '#F2F2F2',
                    }),
                }),
            ]),
        );

        const shadow = store.get(textShadowAtom);
        // 深色主题正文是浅字，压在高亮度壁纸上须补暗影
        expect(shadow).toBeDefined();
        expect(colord(shadow!.textShadowColor).isDark()).toBe(true);
    });

    it('对比度足够时不加阴影', () => {
        setThemeRuntime(
            runtime({ kind: 'fixed', packId: DARK_PACK }, [
                pack(DARK_PACK, {
                    background: background({
                        visibility: 1,
                        averageColor: '#050505',
                    }),
                }),
            ]),
        );

        expect(store.get(textShadowAtom)).toBeUndefined();
    });
});

describe('状态栏判据', () => {
    it('按顶栏压在基底上的合成色判明暗，而不是裸基底', () => {
        // 浅色主题 + 深壁纸 + 控件全实色：基底判暗，但状态栏后方铺的是白色顶栏
        setThemeRuntime(
            runtime({ kind: 'fixed', packId: LIGHT_PACK }, [
                pack(LIGHT_PACK, {
                    background: background({
                        visibility: 1,
                        surfaceOpacity: 1,
                        averageColor: '#050505',
                    }),
                }),
            ]),
        );

        expect(store.get(substrateIsDarkAtom)).toBe(true);
        expect(store.get(chromeIsDarkAtom)).toBe(false);
    });

    it('控件全透明时 chrome 判据回落到基底本身', () => {
        setThemeRuntime(
            runtime({ kind: 'fixed', packId: LIGHT_PACK }, [
                pack(LIGHT_PACK, {
                    background: background({
                        visibility: 1,
                        surfaceOpacity: 0,
                        averageColor: '#050505',
                    }),
                }),
            ]),
        );

        expect(store.get(chromeColorAtom)).toBe(store.get(substrateColorAtom));
        expect(store.get(chromeIsDarkAtom)).toBe(true);
    });
});

describe('对比度体检对 alpha 的处理', () => {
    it('半透明正文按压到基底后的实际颜色量，而不是它不透明时的读数', () => {
        setThemeRuntime(
            runtime({ kind: 'fixed', packId: LIGHT_PACK }, [
                pack(LIGHT_PACK, {
                    colors: { background: '#111111', text: '#FFFFFF1A' },
                }),
            ]),
        );

        // 不做合成的话这里会报接近 19:1，体检显示「良好」而屏幕上几乎看不见
        expect(store.get(substrateTextContrastAtom)).toBeLessThan(2);
    });

    it('不透明正文的读数不受影响', () => {
        setThemeRuntime(
            runtime({ kind: 'fixed', packId: LIGHT_PACK }, [
                pack(LIGHT_PACK, {
                    colors: { background: '#111111', text: '#FFFFFF' },
                }),
            ]),
        );

        expect(store.get(substrateTextContrastAtom)).toBeGreaterThan(15);
    });

    it('半透明正文压不住背景时，自动适配会给出阴影', () => {
        // 基底必须取深色：白字压深底不压底会读出 18.9:1（远高于阈值、不给阴影），
        // 压底后才是 1.3:1。用浅基底两种实现都给阴影，抓不住这条回归
        setThemeRuntime(
            runtime({ kind: 'fixed', packId: DARK_PACK }, [
                pack(DARK_PACK, {
                    colors: { background: '#111111', text: '#FFFFFF1A' },
                    background: background({
                        visibility: 1,
                        averageColor: '#111111',
                    }),
                }),
            ]),
        );

        expect(store.get(textShadowAtom)).toBeDefined();
    });
});

describe('全出血内容与页面基底的接缝', () => {
    /** 渐隐带末端（接缝上方）与收尾带首端（接缝下方）的 alpha */
    function seam() {
        const fade = store.get(pageFadeAtom);
        return {
            above: colord(fade.colors[3]).alpha(),
            below: fade.tailColors ? colord(fade.tailColors[0]).alpha() : 0,
            tailEnd: fade.tailColors
                ? colord(fade.tailColors[1]).alpha()
                : null,
            hue: colord(fade.colors[3]).alpha(1).toHex(),
        };
    }

    it('无背景图时爬到不透明页面底色，无需收尾', () => {
        setThemeRuntime(runtime({ kind: 'fixed', packId: LIGHT_PACK }));

        expect(seam().above).toBe(1);
        expect(seam().hue).toBe(lightColors.background);
        expect(store.get(pageFadeAtom).tailColors).toBeNull();
    });

    it('幕布取页面基底的实际颜色，而不是主题的页面底色', () => {
        // 浅色主题配深壁纸：取主题底色会是一道 50% 的白，压在深壁纸上是一圈亮环
        setThemeRuntime(
            runtime({ kind: 'fixed', packId: LIGHT_PACK }, [
                pack(LIGHT_PACK, {
                    background: background({
                        visibility: 1,
                        averageColor: '#1a1a1a',
                    }),
                }),
            ]),
        );

        expect(seam().hue).toBe('#1a1a1a');
    });

    it('收尾带收到 0，而不是收到页面幕布自己的浓度', () => {
        // 页面幕布是全屏铺的、接缝下方本来就有；收到那个浓度等于叠两层，
        // 且收尾带下沿会凭空多出一级台阶
        setThemeRuntime(
            runtime({ kind: 'fixed', packId: LIGHT_PACK }, [
                pack(LIGHT_PACK, {
                    background: background({ visibility: 0.6 }),
                }),
            ]),
        );

        expect(seam().tailEnd).toBe(0);
    });

    it('接缝处内容图必须完全不可见——无论背景可见度调到哪', () => {
        // 这是接得上的唯一条件：两侧都得与各自底下那张图无关。
        // 幕布只爬到一半时，上方是半张封面、下方是半张壁纸，那就是一条硬边
        for (const visibility of [0, 0.25, 0.5, 0.75, 1]) {
            setThemeRuntime(
                runtime({ kind: 'fixed', packId: LIGHT_PACK }, [
                    pack(LIGHT_PACK, {
                        background: background({ visibility }),
                    }),
                ]),
            );

            expect(seam().above).toBe(1);
            expect(seam().below).toBe(1);
        }
    });

    it('编辑器草稿态（uri 未就绪）按无背景图处理，与 SubstrateLayer 同判据', () => {
        setThemeRuntime(
            runtime({ kind: 'fixed', packId: LIGHT_PACK }, [
                pack(LIGHT_PACK, {
                    background: background({ uri: null, visibility: 1 }),
                }),
            ]),
        );

        expect(seam().above).toBe(1);
        expect(store.get(pageFadeAtom).tailColors).toBeNull();
    });
});
