/**
 * react-native-image-colors 桌面端实现
 * Canvas 取色:统计主色(dominant)、平均色(average)、鲜艳色(vibrant)。
 * 返回 platform: "android" 形状,与移动端 android 分支字段对齐。
 */

interface AndroidImageColors {
    platform: "android";
    dominant: string | null;
    average: string | null;
    vibrant: string | null;
    darkMuted: string | null;
    lightMuted: string | null;
    darkVibrant: string | null;
    lightVibrant: string | null;
}

function rgbToHex(r: number, g: number, b: number): string {
    const hex = (v: number) => v.toString(16).padStart(2, "0");
    return `#${hex(r)}${hex(g)}${hex(b)}`;
}

function saturation(r: number, g: number, b: number): number {
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    if (max === 0) return 0;
    return (max - min) / max;
}

function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => resolve(img);
        img.onerror = () => {
            // 跨域失败时重试(不带 CORS,可能因 canvas 污染再次失败)
            const plain = new Image();
            plain.onload = () => resolve(plain);
            plain.onerror = reject;
            plain.src = src;
        };
        img.src = src;
    });
}

async function getColors(
    url: string,
    options?: { fallback?: string; pixelSpacing?: number; quality?: "low" | "medium" | "high" | "highest" },
): Promise<AndroidImageColors> {
    const fallback = options?.fallback ?? "#ffffff";
    const result: AndroidImageColors = {
        platform: "android",
        dominant: fallback,
        average: fallback,
        vibrant: fallback,
        darkMuted: null,
        lightMuted: null,
        darkVibrant: null,
        lightVibrant: null,
    };

    try {
        const img = await loadImage(url);
        const size = 32;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) return result;
        ctx.drawImage(img, 0, 0, size, size);

        let data: Uint8ClampedArray;
        try {
            data = ctx.getImageData(0, 0, size, size).data;
        } catch {
            // canvas 被跨域污染
            return result;
        }

        const colorCount = new Map<string, { count: number; r: number; g: number; b: number }>();
        let sumR = 0;
        let sumG = 0;
        let sumB = 0;
        let total = 0;
        let bestVibrant: { score: number; r: number; g: number; b: number } | null = null;

        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const a = data[i + 3];
            if (a < 128) continue;

            sumR += r;
            sumG += g;
            sumB += b;
            total++;

            // 量化到 16 级做主色统计
            const key = `${r >> 4},${g >> 4},${b >> 4}`;
            const entry = colorCount.get(key) ?? { count: 0, r: 0, g: 0, b: 0 };
            entry.count++;
            entry.r += r;
            entry.g += g;
            entry.b += b;
            colorCount.set(key, entry);

            // 鲜艳度:饱和度 × 亮度居中加权
            const sat = saturation(r, g, b);
            const light = (Math.max(r, g, b) + Math.min(r, g, b)) / 510;
            const score = sat * (1 - Math.abs(light - 0.5));
            if (!bestVibrant || score > bestVibrant.score) {
                bestVibrant = { score, r, g, b };
            }
        }

        if (total === 0) return result;

        result.average = rgbToHex(
            Math.round(sumR / total),
            Math.round(sumG / total),
            Math.round(sumB / total),
        );

        let dominantEntry: { count: number; r: number; g: number; b: number } | null = null;
        for (const entry of colorCount.values()) {
            if (!dominantEntry || entry.count > dominantEntry.count) {
                dominantEntry = entry;
            }
        }
        if (dominantEntry) {
            result.dominant = rgbToHex(
                Math.round(dominantEntry.r / dominantEntry.count),
                Math.round(dominantEntry.g / dominantEntry.count),
                Math.round(dominantEntry.b / dominantEntry.count),
            );
        }
        if (bestVibrant && bestVibrant.score > 0.1) {
            result.vibrant = rgbToHex(bestVibrant.r, bestVibrant.g, bestVibrant.b);
        }
    } catch {
        // 保持 fallback
    }

    return result;
}

export default { getColors };
