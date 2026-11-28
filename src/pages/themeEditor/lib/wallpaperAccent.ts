import { THEME_BACKGROUND_VISIBILITY_DEFAULT } from '@/core/theme';
import { mixSrgb, resolveThemeColors } from '@/design';
import { colord } from '@/utils/color';

import type { ThemeBackground, ThemePack } from '@/core/theme';
import type { SampledColors } from '@/utils/sampleColors';

/** 强调色在基底上至少要够 UI 组件的 3:1（WCAG 图形门槛），否则按钮 / 激活文字会糊进壁纸里 */
const MIN_ACCENT_CONTRAST = 3;
/**
 * 每步抬 4% 明度，最多 25 步：从最深到最浅够走完，也不会在极端色上死循环
 * 不复用 design 的 adjustForContrast：那份按 isDark 定向、为派生前景调过步长，改它会挪动
 * 已钉住的派生结果；这里是给用户一个起点色，只求够看、少走弯路
 */
const LIGHTNESS_STEP = 0.04;
const MAX_STEPS = 25;

/**
 * 由壁纸主色派生强调色默认值；壁纸没有主色时为 null
 *
 * 基底按「设完这张图之后」的样子算：壁纸平均色与页面底按可见度混（与 `substrateColorAtom`
 * 同一条公式），首次设背景时可见度还没落库，取默认值。主色朝**能达标的那一侧**走到够看为止，
 * 色相不动——用户认出来的还是壁纸里那个颜色
 */
function wallpaperAccent(
    pack: ThemePack,
    sampled: SampledColors,
): string | null {
    if (!sampled.dominantColor) {
        return null;
    }
    const page = resolveThemeColors(pack.scheme, pack.colors, null).background;
    const visibility =
        pack.background?.visibility ?? THEME_BACKGROUND_VISIBILITY_DEFAULT;
    const substrate = mixSrgb(sampled.averageColor, page, 1 - visibility);
    return readableOn(sampled.dominantColor, substrate);
}

function readableOn(accent: string, substrate: string): string {
    const base = colord(substrate);
    // 方向按黑 / 白哪个对基底更有对比度定，不按 isDark：鲜绿这类「亮但不白」的基底上白字只有 2:1，
    // 得往深走才够；而黑白两端对任何颜色至少有一端 ≥ 4.5:1，走到底一定达标
    const lighten =
        colord('#ffffff').contrast(base) >= colord('#000000').contrast(base);
    let color = colord(accent);
    // 对比度按量化后的 hex 判：全精度值在门槛边上收工，落地一取整就掉到门槛之下
    for (
        let step = 0;
        step < MAX_STEPS &&
        colord(color.toHex()).contrast(base) < MIN_ACCENT_CONTRAST;
        step += 1
    ) {
        color = lighten
            ? color.lighten(LIGHTNESS_STEP)
            : color.darken(LIGHTNESS_STEP);
    }
    return color.toHex();
}

/**
 * 强调色是否还跟着（上一张）壁纸：没自定义过，或等于那张壁纸派生出的默认值
 * 两边都是 core 规范化后的存储值，直接比字符串
 */
function accentFollowsWallpaper(
    primary: string | undefined,
    background: ThemeBackground | null | undefined,
): boolean {
    return (
        primary === undefined ||
        (background?.accentColor != null && primary === background.accentColor)
    );
}

export { accentFollowsWallpaper, wallpaperAccent };
