import { colord, extend } from 'colord';
import a11yPlugin from 'colord/plugins/a11y';
import mixPlugin from 'colord/plugins/mix';

// colord 插件全局单次装配：a11y(对比度) + mix(混色)
// 其余插件（names/harmonies/lch）待 color picker 那轮按需再 extend
extend([a11yPlugin, mixPlugin]);

export { colord };
export type { Colord } from 'colord';

/**
 * HSV→RGB（0..255）；h 0–360，s/v 0–1
 *
 * 刻意照抄 colord 的算式（按扇区查表取 v/o/i/s 三档，而不是走 chroma+m 的通用写法）：
 * 两者代数等价但浮点不等价——通用写法算最大通道时是 `v*s + (v − v*s)`，在 .5 舍入边界上
 * 会与 colord 的 `v` 差 1/255。整数网格上 3682561 个点里有 2673 个这样翻车，
 * 而那正是 `toHsv()` 取整后落进来的定义域。抄同一条算式，差异归零
 */
export function hsvToRgb(
    h: number,
    s: number,
    v: number,
): { r: number; g: number; b: number } {
    'worklet';
    const t = ((((h % 360) + 360) % 360) / 360) * 6;
    const sector = Math.floor(t);
    const low = v * (1 - s);
    const falling = v * (1 - (t - sector) * s);
    const rising = v * (1 - (1 - t + sector) * s);
    // colord 用三个数组按扇区查表；这里改写成 switch 只为过 noUncheckedIndexedAccess，
    // 每档取的数与它逐位对应（default 对应 k=0，t<6 恒成立、实际到不了）
    const to255 = (channel: number) => Math.round(255 * channel);
    switch (sector % 6) {
        case 1:
            return { r: to255(falling), g: to255(v), b: to255(low) };
        case 2:
            return { r: to255(low), g: to255(v), b: to255(rising) };
        case 3:
            return { r: to255(low), g: to255(falling), b: to255(v) };
        case 4:
            return { r: to255(rising), g: to255(low), b: to255(v) };
        case 5:
            return { r: to255(v), g: to255(low), b: to255(falling) };
        default:
            return { r: to255(v), g: to255(rising), b: to255(low) };
    }
}

/** 两位十六进制，不足补零 */
function hex2(n: number): string {
    'worklet';
    const x = n.toString(16);
    return x.length < 2 ? `0${x}` : x;
}

/**
 * HSVA → hex（不透明 `#rrggbb` / 半透明 `#rrggbbaa`，CSS 顺序），小写
 *
 * 与 `colord({ h, s: s * 100, v: v * 100, a }).toHex()` 逐字节等价——连同它「alpha 先圆到
 * 3 位小数、再乘 255 取整、满 1 才省略后缀」的规则。`utils/color.test.ts` 把整数网格
 * 全量扫一遍来守这条：随机采样守不住，浮点舍入平局是零测度事件，抽不中。
 *
 * 之所以不直接调 colord：这是个 worklet。取色器拖动时要在 UI 线程算出 Hex 回显文本，
 * 而 colord 是普通 JS 对象、进不了 worklet。提交路径也走同一个函数，两边不可能给出不同的字符串
 */
export function hsvaToHex(h: number, s: number, v: number, a: number): string {
    'worklet';
    const { r, g, b } = hsvToRgb(h, s, v);
    const alpha = Math.round(a * 1000) / 1000;
    const suffix = alpha < 1 ? hex2(Math.round(alpha * 255)) : '';
    return `#${hex2(r)}${hex2(g)}${hex2(b)}${suffix}`;
}
