import { colord, hsvaToHex, hsvToRgb } from './color';

/**
 * `hsvaToHex` 是手写的 colord 替身：取色器拖动时要在 UI 线程（worklet）算出 Hex 回显，
 * 而 colord 进不去 worklet。松手提交走的是同一个函数，所以「拖动中看到的」与「最终存下的」
 * 天然一致；真正要守的不变式是它与 colord 的输出**逐字节相同**——
 * 一旦漂移，取色器里显示的色值就和整个 app 其余地方（走 colord）对不上号
 */
function viaColord(h: number, s: number, v: number, a: number): string {
    // 走 colord 自己的 HSV 模型，而不是拿我们的 hsvToRgb 去喂它——
    // 否则这条断言只校验了序列化那一半，色相扇区写反了也照样通过
    return colord({ h, s: s * 100, v: v * 100, a }).toHex();
}

/** 确定性伪随机：用固定种子扫描色空间，失败可复现 */
function lcg(seed: number): () => number {
    const modulus = 2 ** 32;
    let state = seed % modulus;
    return () => {
        state = (state * 1664525 + 1013904223) % modulus;
        return state / modulus;
    };
}

describe('hsvaToHex', () => {
    // 扫整数网格，而不是随机采样：两种实现的差异只发生在浮点 .5 舍入平局上，
    // 那是零测度事件——随机取 double 抽不中（我最初就是这么写的，报 0 失配，是假测试）。
    // 而 `parseHsva` 走 colord 的 toHsv()，它把 h/s/v 取整，产出的**恰好就是这张网格**。
    //
    // s/v 两维取满，h 按步长 7 抽（全扫要 5s，占掉整个测试套件一半时间）。抽得起是因为
    // 失配在色相上不挑食：改回通用算式时 361 个 h 值**每一个**都有失配点，抽哪些都撞得上
    it('在整数网格上与 colord 逐字节一致', () => {
        const mismatches: string[] = [];
        for (let h = 0; h <= 360; h += 7) {
            for (let s = 0; s <= 100; s++) {
                for (let v = 0; v <= 100; v++) {
                    const mine = hsvaToHex(h, s / 100, v / 100, 1);
                    const theirs = viaColord(h, s / 100, v / 100, 1);
                    if (mine !== theirs && mismatches.length < 5) {
                        mismatches.push(
                            `hsv(${h},${s},${v}) ${mine} ≠ ${theirs}`,
                        );
                    }
                }
            }
        }
        expect(mismatches).toEqual([]);
    });

    it('在连续取值上与 colord 逐字节一致', () => {
        const rand = lcg(20260902);
        const mismatches: string[] = [];
        for (let i = 0; i < 20000; i++) {
            const h = rand() * 360;
            const s = rand();
            const v = rand();
            const a = rand();
            const mine = hsvaToHex(h, s, v, a);
            const theirs = viaColord(h, s, v, a);
            if (mine !== theirs) {
                mismatches.push(
                    `hsva(${h},${s},${v},${a}) ${mine} ≠ ${theirs}`,
                );
            }
        }
        expect(mismatches.slice(0, 5)).toEqual([]);
    });

    // alpha 的取整规则最容易写歪：colord 先把 alpha 圆到 3 位小数、再乘 255 取整，
    // 且只有圆完仍 <1 才追加后缀。0.9996 圆成 1 → 必须退化成 6 位，不能写成 #......ff
    it.each([0, 0.0004, 0.002, 0.5, 0.502, 0.999, 0.9994, 0.9996, 1])(
        'alpha=%p 的取整与省略规则与 colord 一致',
        alpha => {
            for (const [h, s, v] of [
                [0, 0, 0],
                [0, 0, 1],
                [360, 1, 1],
                [180, 0.5, 0.5],
                [42, 0.87, 0.13],
            ] as const) {
                expect(hsvaToHex(h, s, v, alpha)).toBe(
                    viaColord(h, s, v, alpha),
                );
            }
        },
    );

    it('输出小写，且不透明时不带 alpha 后缀', () => {
        const opaque = hsvaToHex(210, 0.8, 0.9, 1);
        expect(opaque).toBe(opaque.toLowerCase());
        expect(opaque).toMatch(/^#[0-9a-f]{6}$/);
        expect(hsvaToHex(210, 0.8, 0.9, 0.5)).toMatch(/^#[0-9a-f]{8}$/);
    });
});

describe('hsvToRgb', () => {
    // 六个扇区各取一个端点：把 hh<1/2/3/4/5 的分支边界钉住，改写分支会立刻炸
    it.each([
        [0, '#ff0000'],
        [60, '#ffff00'],
        [120, '#00ff00'],
        [180, '#00ffff'],
        [240, '#0000ff'],
        [300, '#ff00ff'],
    ])('h=%p 满饱和满明度落在正确扇区', (h, expected) => {
        expect(hsvaToHex(h as number, 1, 1, 1)).toBe(expected);
    });

    it('色相取模到 0–360，负数与超圈都归位', () => {
        expect(hsvToRgb(-60, 1, 1)).toEqual(hsvToRgb(300, 1, 1));
        expect(hsvToRgb(420, 1, 1)).toEqual(hsvToRgb(60, 1, 1));
    });

    it('饱和度为 0 时是灰阶，与色相无关', () => {
        expect(hsvToRgb(0, 0, 0.5)).toEqual(hsvToRgb(200, 0, 0.5));
        expect(hsvaToHex(200, 0, 1, 1)).toBe('#ffffff');
        expect(hsvaToHex(200, 1, 0, 1)).toBe('#000000');
    });
});
