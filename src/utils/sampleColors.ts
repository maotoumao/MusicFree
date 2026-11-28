/**
 * 从一小块采样像素里读颜色：平均色定明暗，主色调给强调色一个默认值
 *
 * 纯像素数学、不碰 Skia——好测，也让烘焙模块只管画布。像素缓冲是 RGBA 逐通道排布，
 * Float32 缓冲已是 0–1，8 位缓冲直接就是通道值
 */

interface SampledColors {
    /** 平均色（`#RRGGBB`）：判明暗与对比度都要在 sRGB 空间做，故给颜色不给亮度 */
    readonly averageColor: string;
    /**
     * 主色调（`#RRGGBB`）：占比最大的那一档有彩色的色相（档内按饱和度加权平均），**没抬过对比度**；
     * 整张图都是灰 / 黑 / 白时为 null。拿去当强调色前还要按所在底色抬到够看
     */
    readonly dominantColor: string | null;
}

const AVERAGE_COLOR_FALLBACK = '#808080';
/**
 * 主色调的入选门槛：饱和度太低是灰 / 近白，明度太低是近黑——都不算「一个颜色」
 * 不设明度上限：HSV 的 V 是最大通道，纯红 / 鲜橙的 V 就是 1，卡上限会把整张鲜艳壁纸判成没主色
 */
const ACCENT_MIN_SATURATION = 0.25;
const ACCENT_MIN_VALUE = 0.2;
/**
 * 色相分 12 档（30° 一档）：够把橙和红分开，又不至于把同一片天空拆成三档
 * 档位整体转半档，让缝落在 15°（红橙之间）而不是 0°：红是唯一跨 0° / 360° 的色族，
 * 缝开在 0° 会把一片红劈成两档，让少数派的蓝反而胜出
 */
const HUE_BINS = 12;
const HUE_BIN_WIDTH = 360 / HUE_BINS;
/** 有彩色的像素合计占比低于此值就当整图没颜色：几乎全灰的图里几个彩色噪点不该决定强调色 */
const ACCENT_MIN_COVERAGE = 0.04;

interface HueBin {
    weight: number;
    count: number;
    red: number;
    green: number;
    blue: number;
}

function sampleColors(pixels: Float32Array | Uint8Array): SampledColors {
    const scale = pixels instanceof Float32Array ? 255 : 1;
    let red = 0;
    let green = 0;
    let blue = 0;
    let count = 0;
    let qualified = 0;
    const bins: HueBin[] = Array.from({ length: HUE_BINS }, () => ({
        weight: 0,
        count: 0,
        red: 0,
        green: 0,
        blue: 0,
    }));
    for (let index = 0; index + 3 < pixels.length; index += 4) {
        const r = pixels[index]! * scale;
        const g = pixels[index + 1]! * scale;
        const b = pixels[index + 2]! * scale;
        red += r;
        green += g;
        blue += b;
        count += 1;

        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const value = max / 255;
        const saturation = max === 0 ? 0 : (max - min) / max;
        if (saturation < ACCENT_MIN_SATURATION || value < ACCENT_MIN_VALUE) {
            continue;
        }
        qualified += 1;
        const bin = bins[hueBinOf(r, g, b, max, min)]!;
        // 饱和度当权重：同一档里越「像颜色」的像素越有发言权
        bin.weight += saturation;
        bin.count += 1;
        bin.red += r * saturation;
        bin.green += g * saturation;
        bin.blue += b * saturation;
    }
    if (count === 0) {
        return { averageColor: AVERAGE_COLOR_FALLBACK, dominantColor: null };
    }
    const averageColor = toHex(red / count, green / count, blue / count);
    let dominant = bins[0]!;
    for (const bin of bins) {
        if (bin.weight > dominant.weight) {
            dominant = bin;
        }
    }
    if (dominant.count === 0 || qualified / count < ACCENT_MIN_COVERAGE) {
        return { averageColor, dominantColor: null };
    }
    return {
        averageColor,
        dominantColor: toHex(
            dominant.red / dominant.weight,
            dominant.green / dominant.weight,
            dominant.blue / dominant.weight,
        ),
    };
}

/** 色相（0–360）落到哪一档（缝在半档处）；max === min 的灰在调用前已被饱和度门槛挡掉 */
function hueBinOf(
    r: number,
    g: number,
    b: number,
    max: number,
    min: number,
): number {
    const delta = max - min;
    let hue: number;
    if (max === r) {
        hue = ((g - b) / delta) % 6;
    } else if (max === g) {
        hue = (b - r) / delta + 2;
    } else {
        hue = (r - g) / delta + 4;
    }
    hue = (hue * 60 + 360) % 360;
    return (
        Math.floor(((hue + HUE_BIN_WIDTH / 2) % 360) / HUE_BIN_WIDTH) % HUE_BINS
    );
}

function toHex(red: number, green: number, blue: number): string {
    return `#${toHexByte(red)}${toHexByte(green)}${toHexByte(blue)}`;
}

function toHexByte(value: number): string {
    return Math.max(0, Math.min(255, Math.round(value)))
        .toString(16)
        .padStart(2, '0');
}

export { AVERAGE_COLOR_FALLBACK, sampleColors };
export type { SampledColors };
