import { colord } from './color';
import { sampleColors } from './sampleColors';

/** 按 RGB 列表拼一块 RGBA_8888 像素缓冲 */
function pixels(colors: readonly (readonly [number, number, number])[]) {
    const buffer = new Uint8Array(colors.length * 4);
    colors.forEach(([r, g, b], index) => {
        buffer.set([r, g, b, 255], index * 4);
    });
    return buffer;
}

function repeat<T>(item: T, times: number): T[] {
    return Array.from({ length: times }, () => item);
}

describe('平均色', () => {
    it('逐通道取均值', () => {
        expect(
            sampleColors(
                pixels([
                    [0, 0, 0],
                    [255, 255, 255],
                ]),
            ).averageColor,
        ).toBe('#808080');
    });

    it('Float32 缓冲按 0–1 换算', () => {
        const buffer = new Float32Array([1, 0, 0, 1, 0, 0, 1, 1]);
        expect(sampleColors(buffer).averageColor).toBe('#800080');
    });

    it('空缓冲给中性回退，且没有主色', () => {
        expect(sampleColors(new Uint8Array(0))).toEqual({
            averageColor: '#808080',
            dominantColor: null,
        });
    });
});

describe('主色调', () => {
    it('大片灰里的一块彩色成为主色，而平均色仍是偏灰的', () => {
        const sample = sampleColors(
            pixels([
                ...repeat([120, 120, 120] as const, 60),
                ...repeat([30, 120, 220] as const, 20),
            ]),
        );

        expect(sample.dominantColor).toBe('#1e78dc');
        expect(sample.averageColor).not.toBe('#1e78dc');
    });

    it('红跨 0° / 360° 两侧也算同一档：不会被劈开后让少数派的蓝胜出', () => {
        const sample = sampleColors(
            pixels([
                ...repeat([200, 40, 50] as const, 30), // 色相 ≈ 356°
                ...repeat([200, 50, 40] as const, 30), // 色相 ≈ 4°
                ...repeat([40, 80, 200] as const, 40),
            ]),
        );

        expect(colord(sample.dominantColor!).toHsl().h).toBeLessThan(15);
    });

    it('两种颜色相争时取占比更大的那一档色相', () => {
        const sample = sampleColors(
            pixels([
                ...repeat([220, 80, 40] as const, 30),
                ...repeat([40, 200, 90] as const, 50),
            ]),
        );

        expect(sample.dominantColor).toBe('#28c85a');
    });

    it('同一档色相内按饱和度加权平均，而不是只取一个像素', () => {
        const sample = sampleColors(
            pixels([
                ...repeat([200, 40, 40] as const, 10),
                ...repeat([220, 120, 120] as const, 10),
            ]),
        );

        // 深红饱和度 0.8、浅红 0.45：结果落在两者之间且偏向深红
        expect(sample.dominantColor).toBe('#cf4545');
    });

    it('全灰、全黑、全白的图没有主色', () => {
        expect(
            sampleColors(
                pixels([
                    ...repeat([128, 128, 128] as const, 10),
                    ...repeat([8, 8, 8] as const, 10),
                    ...repeat([250, 250, 250] as const, 10),
                ]),
            ).dominantColor,
        ).toBeNull();
    });

    it('近黑、近白的彩色像素不入选：它们看着不是「一个颜色」', () => {
        expect(
            sampleColors(
                pixels([
                    ...repeat([40, 10, 10] as const, 10),
                    ...repeat([250, 245, 245] as const, 10),
                ]),
            ).dominantColor,
        ).toBeNull();
    });

    it('纯饱和色不因明度满格被挡：整张鲜红壁纸的主色就是红', () => {
        expect(
            sampleColors(pixels(repeat([255, 0, 0] as const, 20)))
                .dominantColor,
        ).toBe('#ff0000');
    });

    it('彩色像素合计不到 4% 时当噪点忽略，到 4% 就算', () => {
        expect(
            sampleColors(
                pixels([
                    ...repeat([100, 100, 100] as const, 97),
                    ...repeat([220, 0, 0] as const, 3),
                ]),
            ).dominantColor,
        ).toBeNull();
        expect(
            sampleColors(
                pixels([
                    ...repeat([100, 100, 100] as const, 96),
                    ...repeat([220, 0, 0] as const, 4),
                ]),
            ).dominantColor,
        ).toBe('#dc0000');
    });
});
