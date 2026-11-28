import { atom } from 'jotai';
import { Appearance } from 'react-native';

import { atomStore } from '@/utils/atomStore';
import { colord } from '@/utils/color';

import { compositeOver, mixSrgb } from './colorMath';
import { resolveThemeColors } from './resolveThemeColors';
import { palette } from './tokens/palette';

import type { ColorScheme, Colors, ThemeColorOverride } from './tokens/colors';

/** 当前主题的背景图层参数 */
interface ThemeBackgroundLayer {
    /** 已烘焙渲染位图的 URI；null = 编辑中的草稿，图层由编辑器自绘 */
    readonly uri: string | null;
    /** 背景可见度：0 = 完全被幕布盖住，1 = 原图直出 */
    readonly visibility: number;
    /** 控件不透明度：施加到 surface / surfaceVariant 的 alpha */
    readonly surfaceOpacity: number;
    /** 烘焙时采样的成图平均色（`#RRGGBB`） */
    readonly averageColor: string;
}

/** 一套主题在运行态的投影 */
interface ThemePackRuntime {
    readonly id: string;
    readonly scheme: ColorScheme;
    readonly colors: ThemeColorOverride;
    readonly background: ThemeBackgroundLayer | null;
    readonly autoContrast: boolean;
}

type ThemeSelectionRuntime =
    | { readonly kind: 'fixed'; readonly packId: string }
    | {
          readonly kind: 'system';
          readonly dayPackId: string;
          readonly nightPackId: string;
      };

interface ThemeRuntime {
    /** 内置 + 用户主题的全集 */
    readonly packs: readonly ThemePackRuntime[];
    readonly selection: ThemeSelectionRuntime;
}

/** 文字压在背景图上时的兜底描边；不改文字色，只加一层同向阴影 */
interface TextShadowLayer {
    readonly textShadowColor: string;
    readonly textShadowOffset: {
        readonly width: number;
        readonly height: number;
    };
    readonly textShadowRadius: number;
}

/** 低于此对比度才启用文字阴影兜底 */
const AUTO_CONTRAST_THRESHOLD = 3;
const TEXT_SHADOW_ALPHA = 0.55;
const TEXT_SHADOW_RADIUS = 3;

const EMPTY_COLOR_OVERRIDE: ThemeColorOverride = Object.freeze({});

const EMPTY_RUNTIME: ThemeRuntime = Object.freeze({
    packs: Object.freeze([]),
    selection: Object.freeze({
        kind: 'system' as const,
        dayPackId: '',
        nightPackId: '',
    }),
});

/**
 * 主题运行态：packs 与 selection 同属一个原子
 * 分成两个原子写会出现「新 packs + 旧 selection」的中间态——删掉当前主题时，
 * 那一瞬间 selection 指向已不存在的主题，派生链会先回落一次空主题再切到正确回退
 */
const themeRuntimeAtom = atom<ThemeRuntime>(EMPTY_RUNTIME);

/** 编辑器草稿：非 undefined 时整体取代当前生效主题，退出编辑时清除 */
const themePreviewAtom = atom<ThemePackRuntime | undefined>(undefined);

/**
 * 系统当前浅深模式：seed 自 Appearance
 * onMount 自挂 Appearance 监听（有组件读颜色时才激活），无需 bootstrap 手动接线
 */
const systemColorSchemeAtom = atom<ColorScheme>(
    Appearance.getColorScheme() === 'dark' ? 'dark' : 'light',
);
systemColorSchemeAtom.onMount = setScheme => {
    // 首次订阅时重新同步一次（防模块早加载、系统主题已变）
    setScheme(Appearance.getColorScheme() === 'dark' ? 'dark' : 'light');
    const sub = Appearance.addChangeListener(({ colorScheme }) => {
        setScheme(colorScheme === 'dark' ? 'dark' : 'light');
    });
    return () => sub.remove();
};

/** 当前选中的主题 id：跟随系统时按系统明暗取对应时段 */
function resolveSelectedPackId(
    selection: ThemeSelectionRuntime,
    systemScheme: ColorScheme,
): string {
    if (selection.kind === 'fixed') {
        return selection.packId;
    }
    return systemScheme === 'dark'
        ? selection.nightPackId
        : selection.dayPackId;
}

/** 当前生效主题：草稿优先，其次按选择解析；解析不到时回落系统明暗的空主题 */
const activePackAtom = atom<ThemePackRuntime>(get => {
    const preview = get(themePreviewAtom);
    if (preview) {
        return preview;
    }
    const runtime = get(themeRuntimeAtom);
    const systemScheme = get(systemColorSchemeAtom);
    const packId = resolveSelectedPackId(runtime.selection, systemScheme);
    return (
        runtime.packs.find(pack => pack.id === packId) ?? {
            id: '',
            scheme: systemScheme,
            colors: EMPTY_COLOR_OVERRIDE,
            background: null,
            autoContrast: true,
        }
    );
});

/** 当前实际浅深方向：由生效主题继承的内建底表决定 */
const colorSchemeAtom = atom<ColorScheme>(get => get(activePackAtom).scheme);

const backgroundLayerAtom = atom<ThemeBackgroundLayer | null>(
    get => get(activePackAtom).background,
);

const hasBackgroundLayerAtom = atom<boolean>(
    get => get(backgroundLayerAtom) !== null,
);

/** 当前生效颜色：内建底表 + 用户覆盖 + 派生补全 + 背景在场时的半透明面 */
const colorsAtom = atom<Colors>(get => {
    const pack = get(activePackAtom);
    return resolveThemeColors(
        pack.scheme,
        pack.colors,
        pack.background?.surfaceOpacity ?? null,
    );
});

/**
 * 页面基底的实际颜色：壁纸平均色与幕布按可见度在 **sRGB 空间**合成
 *
 * 必须在 sRGB 空间混：真实合成发生在 `ThemedBackground` 的 `opacity`，
 * GPU 的 alpha 混合就是逐通道 sRGB 加权。若拿相对亮度（线性光）做同样的加权，
 * 结果会系统性偏高——深壁纸 + 高可见度这一最需要兜底的区间会被判成「够亮」。
 */
const substrateColorAtom = atom<string>(get => {
    const veil = get(colorsAtom).background;
    const background = get(backgroundLayerAtom);
    if (!background) {
        return veil;
    }
    return mixSrgb(background.averageColor, veil, 1 - background.visibility);
});

/** 基底是否偏暗 */
const substrateIsDarkAtom = atom<boolean>(get =>
    colord(get(substrateColorAtom)).isDark(),
);

/**
 * 常驻 chrome（顶栏 / 播放条）压在基底之上后的实际颜色
 *
 * 状态栏后方铺的是顶栏的 surface 而非裸基底：控件不透明度拉高时两者可以完全相反
 * （浅色主题 + 深壁纸 → 基底判暗选白图标，实际背后是白色顶栏 → 白底白图标）。
 * 故状态栏图标色一律以合成后的颜色判向。
 */
const chromeColorAtom = atom<string>(get =>
    compositeOver(get(colorsAtom).surface, get(substrateColorAtom)),
);

/** chrome 是否偏暗：状态栏图标色的唯一真相源 */
const chromeIsDarkAtom = atom<boolean>(get =>
    colord(get(chromeColorAtom)).isDark(),
);

/**
 * 正文压在页面基底上之后的实际颜色
 * 正文本身允许带 alpha，不先压到基底上就量对比度，会拿到它不透明时的数字——
 * 10% 的白字压在近黑底上会报 18.9:1，体检显示「良好」而屏幕上几乎看不见
 */
const substrateTextColorAtom = atom<string>(get =>
    compositeOver(get(colorsAtom).text, get(substrateColorAtom)),
);

/** 正文与页面基底的实际对比度：编辑器的体检提示与文字自适配共用同一判据 */
const substrateTextContrastAtom = atom<number>(get =>
    colord(get(substrateTextColorAtom)).contrast(get(substrateColorAtom)),
);

/** 文字自适配：仅在主题开启且正文与基底对比度不足时给出阴影，不改文字色 */
const textShadowAtom = atom<TextShadowLayer | undefined>(get => {
    const pack = get(activePackAtom);
    if (!pack.autoContrast || !pack.background) {
        return undefined;
    }
    if (get(substrateTextContrastAtom) >= AUTO_CONTRAST_THRESHOLD) {
        return undefined;
    }
    const textIsLighter =
        colord(get(substrateTextColorAtom)).luminance() >
        colord(get(substrateColorAtom)).luminance();
    return {
        textShadowColor: colord(
            textIsLighter ? palette.neutral1000 : palette.neutral0,
        )
            .alpha(TEXT_SHADOW_ALPHA)
            .toRgbString(),
        textShadowOffset: { width: 0, height: 0 },
        textShadowRadius: TEXT_SHADOW_RADIUS,
    };
});

/** 从持久化主题偏好一次性同步设计运行态 */
function setThemeRuntime(runtime: ThemeRuntime): void {
    if (!sameRuntime(atomStore.get(themeRuntimeAtom), runtime)) {
        atomStore.set(themeRuntimeAtom, runtime);
    }
}

/** 设置编辑器草稿；undefined 清除草稿、恢复当前持久投影 */
function setThemePreview(pack: ThemePackRuntime | undefined): void {
    if (!samePreview(atomStore.get(themePreviewAtom), pack)) {
        atomStore.set(themePreviewAtom, pack);
    }
}

function sameRuntime(current: ThemeRuntime, next: ThemeRuntime): boolean {
    return (
        sameSelection(current.selection, next.selection) &&
        current.packs.length === next.packs.length &&
        current.packs.every((pack, index) => samePack(pack, next.packs[index]!))
    );
}

function samePreview(
    current: ThemePackRuntime | undefined,
    next: ThemePackRuntime | undefined,
): boolean {
    if (current === undefined || next === undefined) {
        return current === next;
    }
    return samePack(current, next);
}

function samePack(current: ThemePackRuntime, next: ThemePackRuntime): boolean {
    return (
        current.id === next.id &&
        current.scheme === next.scheme &&
        current.autoContrast === next.autoContrast &&
        sameColors(current.colors, next.colors) &&
        sameBackground(current.background, next.background)
    );
}

function sameColors(
    current: ThemeColorOverride,
    next: ThemeColorOverride,
): boolean {
    const currentKeys = Object.keys(current) as (keyof Colors)[];
    return (
        currentKeys.length === Object.keys(next).length &&
        currentKeys.every(key => current[key] === next[key])
    );
}

function sameBackground(
    current: ThemeBackgroundLayer | null,
    next: ThemeBackgroundLayer | null,
): boolean {
    return (
        current === next ||
        (current != null &&
            next != null &&
            current.uri === next.uri &&
            current.visibility === next.visibility &&
            current.surfaceOpacity === next.surfaceOpacity &&
            current.averageColor === next.averageColor)
    );
}

function sameSelection(
    current: ThemeSelectionRuntime,
    next: ThemeSelectionRuntime,
): boolean {
    if (current.kind === 'fixed' && next.kind === 'fixed') {
        return current.packId === next.packId;
    }
    if (current.kind === 'system' && next.kind === 'system') {
        return (
            current.dayPackId === next.dayPackId &&
            current.nightPackId === next.nightPackId
        );
    }
    return false;
}

export {
    activePackAtom,
    backgroundLayerAtom,
    chromeColorAtom,
    chromeIsDarkAtom,
    colorSchemeAtom,
    colorsAtom,
    hasBackgroundLayerAtom,
    resolveSelectedPackId,
    setThemePreview,
    setThemeRuntime,
    substrateColorAtom,
    substrateIsDarkAtom,
    substrateTextColorAtom,
    substrateTextContrastAtom,
    systemColorSchemeAtom,
    textShadowAtom,
    themeRuntimeAtom,
};
export type {
    TextShadowLayer,
    ThemeBackgroundLayer,
    ThemePackRuntime,
    ThemeRuntime,
    ThemeSelectionRuntime,
};
