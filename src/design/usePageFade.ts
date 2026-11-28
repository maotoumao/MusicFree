import { atom, useAtomValue } from 'jotai';

import { colord } from '@/utils/color';

import { backgroundLayerAtom, substrateColorAtom } from './colorScheme';

/** 全出血内容底部与页面基底之间的过渡取值，直接喂给 LinearGradient */
interface PageFade {
    /** 内容底部渐隐带：由透明爬升到接缝处的幕布浓度 */
    readonly colors: readonly [string, string, string, string];
    readonly locations: readonly [number, number, number, number];
    /** 接缝下方把这一份不透明幕布收干净；null = 无壁纸，页面底本就不透明、无物可收 */
    readonly tailColors: readonly [string, string] | null;
}

/** 底色本身按 alpha 平滑多档爬升（非 transparent＝透明黑，免经灰调），无色带 */
const FADE_STEPS = [0, 0.35, 0.75, 1] as const;
const FADE_LOCATIONS = [0, 0.4, 0.72, 1] as const;

/**
 * 「全出血内容 → 页面基底」的过渡取值
 *
 * 接缝两侧要接得上，靠的**不是幕布浓度连续，而是像素连续**。两侧的构成分别是
 * `内容图 ⊗ 幕布(a)` 与 `壁纸 ⊗ 页面幕布(p) ⊗ 收尾(t)`；两张图毫无关系，
 * 要让所有像素都相等，只能让两侧都**与各自底下那张图无关**——即幕布在接缝处
 * 必须**不透明**。半浓度做不到：上方是半张封面、下方是半张壁纸，那就是一条硬边。
 * 无壁纸时幕布本就爬到 1，那种情况从来没有硬边，正是这条不变量的反证。
 *
 * 代价是接缝那一条线上页面是一片纯色。但它是个**峰**不是**带**——上面爬上去、
 * 下面收回来；且颜色取的是页面基底的实际颜色（壁纸均色与幕布合成后），
 * 于是那片纯色就是壁纸自己的平均色，不会读成一块外来的东西。
 *
 * 收尾**收到 0，而不是收到页面幕布的浓度**：页面幕布是全屏铺的、接缝下方本来就有，
 * 收到那个浓度等于在这一段叠了两层，且收尾带下沿会凭空多出一级台阶。
 */
const pageFadeAtom = atom<PageFade>(get => {
    const background = get(backgroundLayerAtom);
    const base = colord(get(substrateColorAtom));
    // 判据与 SubstrateLayer 对齐：uri 未就绪（编辑器草稿态）时页面底仍是不透明实色
    const hasWallpaper = background?.uri != null;
    const at = (step: number) => base.alpha(step).toRgbString();
    return {
        colors: [
            at(FADE_STEPS[0]),
            at(FADE_STEPS[1]),
            at(FADE_STEPS[2]),
            at(FADE_STEPS[3]),
        ],
        locations: FADE_LOCATIONS,
        // 无壁纸时接缝下方就是同一个不透明底色，与接缝同色，无物可收
        tailColors: hasWallpaper ? [at(1), at(0)] : null,
    };
});

function usePageFade(): PageFade {
    return useAtomValue(pageFadeAtom);
}

export { pageFadeAtom, usePageFade };
export type { PageFade };
