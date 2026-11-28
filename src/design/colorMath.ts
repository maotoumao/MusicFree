/**
 * 颜色合成的两条基本运算
 *
 * 都在 **sRGB 空间**逐通道做：真实合成发生在 GPU 的 alpha 混合上，而 alpha 混合就是
 * 逐通道 sRGB 加权。拿相对亮度（线性光）去做同样的加权，结果会系统性偏高。
 */
import { colord } from '@/utils/color';

/** 逐通道线性插值：ratio=0 取 from，1 取 to */
function mixSrgb(from: string, to: string, ratio: number): string {
    const source = colord(from).toRgb();
    const target = colord(to).toRgb();
    const clamped = Math.max(0, Math.min(1, ratio));
    return colord({
        r: Math.round(source.r + (target.r - source.r) * clamped),
        g: Math.round(source.g + (target.g - source.g) * clamped),
        b: Math.round(source.b + (target.b - source.b) * clamped),
    }).toHex();
}

/**
 * 把半透明色压到不透明底上，得到用户**实际看到**的那个颜色
 *
 * 对比度与明暗判定都必须先过这一步：`colord` 的 `contrast()` / `luminance()` 只读 r/g/b，
 * 直接拿半透明色去问，会拿到它不透明时的数字——10% 的白字压在近黑底上会报 18.9:1。
 */
function compositeOver(color: string, base: string): string {
    const parsed = colord(color);
    return mixSrgb(base, parsed.alpha(1).toHex(), parsed.alpha());
}

export { compositeOver, mixSrgb };
