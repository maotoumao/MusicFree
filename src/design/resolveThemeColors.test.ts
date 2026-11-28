import { colord } from '@/utils/color';

/** 低于这个比值就是彻底看不见了：远在 UI 组件门槛 3 之下，比大小没有信息量 */
const INVISIBLE_CONTRAST = 1.5;

import { compositeOver, mixSrgb } from './colorMath';
import { resolveThemeColors } from './resolveThemeColors';
import { coverBackdrop, darkColors, lightColors } from './tokens/colors';

describe('无覆盖时保留内建底表', () => {
    it('浅深两套原样返回，不做任何派生重算', () => {
        expect(resolveThemeColors('light', {}, null)).toEqual(lightColors);
        expect(resolveThemeColors('dark', {}, null)).toEqual(darkColors);
    });
});

describe('派生补全', () => {
    it('覆盖主色时补齐配套的前景与浅底', () => {
        const resolved = resolveThemeColors(
            'light',
            { primary: '#2563EB' },
            null,
        );

        expect(resolved.primary).toBe('#2563EB');
        expect(
            colord(resolved.onPrimary).contrast(resolved.primary),
        ).toBeGreaterThanOrEqual(4.5);
        expect(colord(resolved.primarySoft).alpha()).toBeCloseTo(0.12, 2);
        expect(
            colord(resolved.onPrimarySoft).contrast(resolved.background),
        ).toBeGreaterThanOrEqual(4.5);
    });

    it('显式写入的派生角色优先于派生结果', () => {
        const resolved = resolveThemeColors(
            'light',
            { primary: '#2563EB', onPrimary: '#123456' },
            null,
        );

        expect(resolved.onPrimary).toBe('#123456');
    });

    it('覆盖状态色时补齐其前景，避免同色不可读', () => {
        const resolved = resolveThemeColors(
            'light',
            { danger: '#FFFFFF', warning: '#101010' },
            null,
        );

        // 白底危险色仍配内建白字就会白底白字
        expect(
            colord(resolved.onDanger).contrast(resolved.danger),
        ).toBeGreaterThanOrEqual(4.5);
        expect(
            colord(resolved.onWarning).contrast(resolved.warning),
        ).toBeGreaterThanOrEqual(4.5);
        // warningSoft 跟着警告色重算，否则浅底还是旧色相
        expect(colord(resolved.warningSoft).alpha(1).toHex()).toBe('#101010');
        expect(colord(resolved.warningSoft).alpha()).toBeCloseTo(0.12, 2);
        expect(resolved.onSuccess).toBe(lightColors.onSuccess);
    });

    it('对比度调整朝实际底色的反方向走，不认主题的浅深', () => {
        // 浅色底表 + 用户把页面底改成纯黑：继续加深只会越走越糊
        const resolved = resolveThemeColors(
            'light',
            { background: '#000000', primary: '#2563EB' },
            null,
        );

        expect(
            colord(resolved.onPrimarySoft).contrast('#000000'),
        ).toBeGreaterThanOrEqual(4.5);
    });

    it('覆盖正文或页面底时补齐禁用文字、描边与按压高亮', () => {
        const resolved = resolveThemeColors(
            'dark',
            { text: '#EEEEEE', background: '#001122' },
            null,
        );

        expect(resolved.textDisabled).not.toBe(darkColors.textDisabled);
        expect(colord(resolved.border).alpha()).toBeCloseTo(0.12, 2);
        expect(colord(resolved.ripple).alpha()).toBeCloseTo(0.1, 2);
    });

    it('上游未被覆盖时中性角色保持内建取值', () => {
        const resolved = resolveThemeColors(
            'light',
            { primary: '#2563EB' },
            null,
        );

        expect(resolved.textDisabled).toBe(lightColors.textDisabled);
        expect(resolved.border).toBe(lightColors.border);
    });
});

describe('对比度调整按量化后的结果判', () => {
    /**
     * `adjustForContrast` 交出去的是 `.toHex()`，8 位量化会把门槛边上的值蹭掉一点点。
     * 拿全精度判就会在 4.49 收工——差的那 0.01 正是「刚好达标」与「差一点」的分界，
     * 而这个 helper 服务的是 onPrimarySoft 与沉浸页强调色两条公共路径
     */
    it('派生出来的前景在**落地色值**上就达标，不是全精度上达标', () => {
        // #0022ff 在旧实现下落地是 4.49（全精度判据在门槛边上收工），是这条的靶心
        for (const primary of [
            '#0022ff',
            '#0099cc',
            '#6a1b9a',
            '#2e7d32',
            '#ec407a',
        ]) {
            const light = resolveThemeColors('light', { primary }, null);
            expect(
                colord(light.onPrimarySoft).contrast(
                    compositeOver(light.primarySoft, light.background),
                ),
            ).toBeGreaterThanOrEqual(4.5);
        }
    });
});

describe('沉浸播放页的强调色跟随主色', () => {
    /**
     * 基准的**公式**在此独立重算，不从被测模块 import；但**参数**读 `coverBackdrop`——
     * 参数一改，测试要跟着一起动，而不是拿一组过期数字继续判（那样断言就全失效了）
     *
     * 那一页没有任何一处的底色等于裸 `coverVeil`：模糊封面按 `artOpacity` 压在遮罩上，
     * 再叠该高度的 scrim。最坏情况取纯白封面（实拍白底专辑封面很常见）
     */
    const veil = darkColors.coverVeil;
    const artOnVeil = mixSrgb(
        veil,
        coverBackdrop.worstCaseArt,
        coverBackdrop.artOpacity,
    );
    /** 渐变在某一纵向比例处的 alpha：分段线性，与 Backdrop 的 LinearGradient 同一组数 */
    function alphaAt(location: number): number {
        const stops = coverBackdrop.scrimLocations;
        const alphas = coverBackdrop.scrimAlphas;
        if (location <= stops[0]) {
            return alphas[0];
        }
        for (let i = 1; i < stops.length; i += 1) {
            if (location <= stops[i]!) {
                const span = stops[i]! - stops[i - 1]!;
                const ratio =
                    span === 0 ? 0 : (location - stops[i - 1]!) / span;
                return alphas[i - 1]! + (alphas[i]! - alphas[i - 1]!) * ratio;
            }
        }
        return alphas[alphas.length - 1]!;
    }
    const baseAt = (location: number) =>
        mixSrgb(artOnVeil, veil, alphaAt(location));
    /** 进度轨：coverBorder（白@0.16）压在同一个底上，比底色亮 */
    const trackAt = (location: number) =>
        compositeOver(darkColors.coverBorder, baseAt(location));
    /**
     * 不截断的真实对比度
     *
     * `colord` 的 `contrast()` 与 `luminance()` 都**向下截到两位小数**，
     * 拿它判「不低于内建」会有 0.01 的盲区：内建实心橙的真实比值 3.3832 被报成 3.38，
     * 于是真实 3.3818 的候选也过关——那正是这条不变量要挡的东西。故此处自算
     */
    function trueContrast(a: string, b: string): number {
        const luminance = (hex: string) => {
            const { r, g, b: blue } = colord(hex).toRgb();
            const channel = (value: number) => {
                const ratio = value / 255;
                return ratio <= 0.03928
                    ? ratio / 12.92
                    : Math.pow((ratio + 0.055) / 1.055, 2.4);
            };
            return (
                0.2126 * channel(r) +
                0.7152 * channel(g) +
                0.0722 * channel(blue)
            );
        };
        const first = luminance(a);
        const second = luminance(b);
        return (
            (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05)
        );
    }
    const bandBase = baseAt(coverBackdrop.accentBandLocation);
    const trackBase = trackAt(coverBackdrop.accentBandLocation);

    /**
     * 深色主色在那一页上根本看不见（深紫对底部只有 2.1），必须抬。
     * 断言直接压在门槛上——`adjustForContrast` 的设计是「刚够就收工」，所以这里的
     * 数字若掉到门槛下就是真的坏了，不是余量问题
     */
    it('最坏情况按纯白封面算', () => {
        // 与生产代码共用 token 之后，这颗钉子得单独钉：改成别的颜色两边一起动、别处照样绿
        expect(coverBackdrop.worstCaseArt).toBe('#ffffff');
    });

    it('深色主色被抬亮：对底色够正文、对进度轨够图形', () => {
        const deepPurple = resolveThemeColors(
            'dark',
            { primary: '#6a1b9a' },
            null,
        );

        // 原样搬过去是不可用的——先钉住这个前提，否则下面两条可能只是碰巧成立
        expect(colord('#6a1b9a').contrast(bandBase)).toBeLessThan(4.5);

        // 也钉住「它确实是从主色派生的」，否则整块派生被删掉时内建橙照样满足对比度
        expect(deepPurple.coverAccent).not.toBe(darkColors.coverAccent);
        expect(
            colord(deepPurple.coverAccent).contrast(bandBase),
        ).toBeGreaterThanOrEqual(4.5);
        expect(
            colord(deepPurple.coverAccent).contrast(trackBase),
        ).toBeGreaterThanOrEqual(3);
        expect(
            colord(deepPurple.coverAccentStrong).contrast(bandBase),
        ).toBeGreaterThanOrEqual(3);
        // 抬的是明度不是色相：仍认得出是同一个紫（HSL lighten 会漂一两度，故给 2° 容差）
        expect(
            Math.abs(
                colord(deepPurple.coverAccent).hue() - colord('#6a1b9a').hue(),
            ),
        ).toBeLessThanOrEqual(2);
    });

    /**
     * 实心档与 accent 是两档，不是同一个色：内建表的 400 / 550 就是这个关系
     * （白在 400 上只有 2.77、在 550 上 3.58）。派生要能复现它服务的那张表
     */
    it('实心档朝暗走到浅色前景够用，与 accent 拉开两档', () => {
        const cyan = resolveThemeColors('dark', { primary: '#00bcd4' }, null);

        // 本来就够亮的主色，accent 原样用
        expect(cyan.coverAccent).toBe('#00bcd4');
        // 实心档比它暗——白字在 #00bcd4 原色上只有 2.30，够不到实心填充的 3
        expect(cyan.coverAccentStrong).not.toBe(cyan.coverAccent);
        expect(
            colord(cyan.coverAccentStrong).isDark() ||
                colord(cyan.coverAccentStrong).luminance() <
                    colord(cyan.coverAccent).luminance(),
        ).toBe(true);
        // 于是前景仍是白，而不是翻成黑
        expect(cyan.onCoverAccentStrong).toBe('#ffffff');
        expect(
            colord(cyan.onCoverAccentStrong).contrast(cyan.coverAccentStrong),
        ).toBeGreaterThanOrEqual(3);
    });

    /**
     * 「我什么都没改却变样了」那一类：用户在取色器里原样选中当前深色主题的主色，
     * 播放键不该既变亮、图标又翻黑。少了「朝暗走」那一步就会这样
     */
    it('主色恰好等于内建主色时，播放键图标不翻黑', () => {
        const same = resolveThemeColors(
            'dark',
            { primary: darkColors.primary },
            null,
        );

        // 走的是派生（值与内建那一档不同），但结论与内建一致：白图标
        expect(same.coverAccentStrong).not.toBe(darkColors.coverAccentStrong);
        expect(same.onCoverAccentStrong).toBe('#ffffff');
        /*
         * accent 会被抬成一个略浅的橙，不是逐字节等于内建——把这件事钉住而不是
         * 让它以后变成「意外」：内建橙在控件那一带对底只有 4.37，过不了 4.5 那道门。
         * 换来的是「任意高度都不比内建糟」（见上一条），两者不可兼得
         */
        expect(same.coverAccent).not.toBe(darkColors.coverAccent);
        expect(
            Math.abs(
                colord(same.coverAccent).hue() -
                    colord(darkColors.coverAccent).hue(),
            ),
        ).toBeLessThanOrEqual(2);
        expect(colord(same.coverAccent).contrast(bandBase)).toBeGreaterThan(
            colord(darkColors.coverAccent).contrast(bandBase),
        );
        expect(
            colord(same.onCoverAccentStrong).contrast(same.coverAccentStrong),
        ).toBeGreaterThanOrEqual(3);
    });

    /**
     * **这才是派生真正承诺的东西。** 这一页在浅色封面上没有 AA 余量——纯白文字在渐变
     * 最薄处也只有 3.38、内建橙 1.22——所以绝对门槛（4.5 / 3）注定只在某一档成立。
     * 能承诺、也是用户真正在意的，是「换成我的颜色，这一页不许比默认更糊」：
     * 派生结果在**任意高度**上都不低于它替换掉的内建那一档
     */
    /**
     * 内建那一档在同一底色上**看得见**时，派生不许更糊
     *
     * 跳过内建自己都低于 `INVISIBLE_CONTRAST` 的位置：那是内建色穿过底色亮度的交叉点
     * （实测内建 550 在 0.33~0.40 一带只有 1.007，等于和底色同亮度），
     * 那里内建本身彻底看不见，「不比它更糊」不含任何信息量。派生在那一带可能更好也可能
     * 同样看不见，两者都不构成回归，故不设断言——真正要守的是内建看得见的每一处
     */
    function notWorse(candidate: string, builtin: string, base: string): void {
        const reference = trueContrast(builtin, base);
        if (reference < INVISIBLE_CONTRAST) {
            return;
        }
        expect(trueContrast(candidate, base)).toBeGreaterThanOrEqual(reference);
    }

    it('不管在哪个高度，都不比内建那两档更糊', () => {
        /**
         * accent 上下都用（顶栏下划线 0.06、歌词当前行 0.09~0.73、歌词链接 0.5、工具行 0.68、进度 0.76~0.82），
         * 故整条纵轴都要判。实心档只画播放键：竖屏 0.89~0.91；短窗口分栏的传输簇垂直
         * 居中，按 lib/layout 的几何算最高能到 0.307（窗口高 220dp、下安全区 60 的 strip 档：
         * 栏高 = 220 − 60 − 44(顶栏) − 12(底距) = 104，条带组 101 居中，键心 = 44 + 1.5 + 22），
         * 故从 0.30 起判——比物理上界再留一点
         *
         * 只有渐变最薄的 0.28 一带不判：那里内建 550 自己也只有 1.05，两者同样彻底看不见，
         * 比大小没有意义；而播放键在任何形态下都不会画到那么高
         */
        const accentHeights = [0, 0.1, 0.28, 0.4, 0.5, 0.62, 0.7, 0.8, 0.9, 1];
        const strongHeights = [
            0.3, 0.33, 0.4, 0.5, 0.62, 0.7, 0.8, 0.9, 0.95, 1,
        ];
        for (const primary of [
            '#6a1b9a',
            '#0d47a1',
            '#00bcd4',
            '#808080',
            '#000000',
            '#ffffff',
            '#0022ff',
            '#f2600a',
            // 靶心：截断前这个主色的实心档在 0.89 处真实值 4.1806、内建 4.1874——
            // 差 0.0068，`contrast()` 两边都报 4.18，所以旧写法测不出来
            '#006655',
        ]) {
            const derived = resolveThemeColors('dark', { primary }, null);
            for (const at of accentHeights) {
                notWorse(
                    derived.coverAccent,
                    darkColors.coverAccent,
                    baseAt(at),
                );
                notWorse(
                    derived.coverAccent,
                    darkColors.coverAccent,
                    trackAt(at),
                );
            }
            for (const at of strongHeights) {
                notWorse(
                    derived.coverAccentStrong,
                    darkColors.coverAccentStrong,
                    baseAt(at),
                );
            }
        }
    });

    /**
     * 前景要按**最终生效**的实心色判。曾经按刚算出来的那个判，于是用户显式把实心底
     * 覆盖成白色时，前景也给出白色——1:1，什么都看不见
     */
    it('显式覆盖实心底时，前景按被覆盖后的值重判', () => {
        const overridden = resolveThemeColors(
            'dark',
            { primary: '#00bcd4', coverAccentStrong: '#ffffff' },
            null,
        );

        expect(overridden.coverAccentStrong).toBe('#ffffff');
        // 曾按派生值（#00a1b5）判，于是这里也给出白色——1:1，什么都看不见
        expect(overridden.onCoverAccentStrong).toBe('#000000');
    });

    it('没覆盖主色时三个值都还是内建值', () => {
        const untouched = resolveThemeColors('dark', { text: '#eeeeee' }, null);

        expect(untouched.coverAccent).toBe(darkColors.coverAccent);
        expect(untouched.coverAccentStrong).toBe(darkColors.coverAccentStrong);
        expect(untouched.onCoverAccentStrong).toBe(
            darkColors.onCoverAccentStrong,
        );
    });

    /**
     * 守护测（当前恒真，故意留着）：这几个角色**不许**被加进派生
     * 那一页恒深底，跟着浅色主题翻过去就是浅字压浅底
     */
    it('文字 / 边框 / 遮罩本身不跟主题走', () => {
        const themed = resolveThemeColors(
            'light',
            { primary: '#6a1b9a', text: '#111111', background: '#ffffff' },
            null,
        );

        expect(themed.coverText).toBe(lightColors.coverText);
        expect(themed.coverTextSecondary).toBe(lightColors.coverTextSecondary);
        expect(themed.coverVeil).toBe(lightColors.coverVeil);
        expect(themed.coverScrim).toBe(lightColors.coverScrim);
        expect(themed.coverBorder).toBe(lightColors.coverBorder);
    });

    it('用户显式覆盖强调档时原样保留，不被主色派生顶掉', () => {
        const themed = resolveThemeColors(
            'dark',
            {
                primary: '#0d47a1',
                coverAccent: '#00e5ff',
                coverAccentStrong: '#ffd600',
            },
            null,
        );

        expect(themed.coverAccent).toBe('#00e5ff');
        expect(themed.coverAccentStrong).toBe('#ffd600');
        // 前景按最终生效的实心色判：亮黄上白字不够看，要翻成深色
        expect(themed.onCoverAccentStrong).toBe('#000000');
    });

    it('只改实心档、没动主色：前景仍跟着实心色重判', () => {
        const themed = resolveThemeColors(
            'dark',
            { coverAccentStrong: '#ffffff' },
            null,
        );

        expect(themed.coverAccentStrong).toBe('#ffffff');
        expect(themed.onCoverAccentStrong).toBe('#000000');
        // 细档没被动过：保留内建，不因为实心档被改而重派生
        expect(themed.coverAccent).toBe(darkColors.coverAccent);
    });

    it('实心档带 alpha：前景按它压在播放页底色上的实际颜色判', () => {
        // 20% 的白压在深底上看着仍是暗的，图标要保持白色；直接读 r/g/b 会误判成黑
        const themed = resolveThemeColors(
            'dark',
            { coverAccentStrong: '#ffffff33' },
            null,
        );

        expect(themed.onCoverAccentStrong).toBe('#ffffff');
    });
});

describe('背景在场时的半透明面', () => {
    it('抬升面按控件不透明度变半透明，模态面保持不透明', () => {
        const resolved = resolveThemeColors('light', {}, 0.6);

        expect(colord(resolved.surface).alpha()).toBeCloseTo(0.6, 2);
        expect(colord(resolved.surfaceVariant).alpha()).toBeCloseTo(0.6, 2);
        expect(resolved.overlaySurface).toBe(lightColors.surface);
        // 页面底不参与：它是幕布的颜色，透明度由背景可见度单独控制
        expect(resolved.background).toBe(lightColors.background);
    });

    it('控件不透明度可以归零', () => {
        const resolved = resolveThemeColors('dark', {}, 0);

        expect(colord(resolved.surface).alpha()).toBe(0);
        expect(resolved.overlaySurface).toBe(darkColors.surface);
    });

    it('模态面跟随用户覆盖后的抬升面原色', () => {
        const resolved = resolveThemeColors(
            'light',
            { surface: '#123456' },
            0.5,
        );

        expect(resolved.overlaySurface).toBe('#123456');
        expect(colord(resolved.surface).alpha()).toBeCloseTo(0.5, 2);
    });
});

describe('文字强调序', () => {
    it('改页面底色时次级文字跟着重算，不会比禁用文字还淡', () => {
        const resolved = resolveThemeColors(
            'light',
            { background: '#101010' },
            null,
        );

        const contrastOf = (color: string) => colord(color).contrast('#101010');
        expect(contrastOf(resolved.text)).toBeGreaterThan(
            contrastOf(resolved.textSecondary),
        );
        expect(contrastOf(resolved.textSecondary)).toBeGreaterThan(
            contrastOf(resolved.textDisabled),
        );
    });
});

describe('角色自身 alpha 与控件不透明度', () => {
    it('两者叠乘而非互相覆盖', () => {
        // 用户把卡片单设成 40%，背景那档默认 80%：期望 32%，而不是被顶成 80%
        const resolved = resolveThemeColors(
            'light',
            { surface: '#11223366' },
            0.8,
        );

        expect(colord(resolved.surface).alpha()).toBeCloseTo(0.4 * 0.8, 2);
        expect(colord(resolved.surface).alpha(1).toHex()).toBe('#112233');
    });

    it('任一方为 0 结果就是全透', () => {
        expect(
            colord(
                resolveThemeColors('light', { surface: '#11223300' }, 1)
                    .surface,
            ).alpha(),
        ).toBe(0);
        expect(
            colord(
                resolveThemeColors('light', { surface: '#112233' }, 0).surface,
            ).alpha(),
        ).toBe(0);
    });

    it('模态面恒不透明：既不吃控件不透明度，也不跟用户给 surface 设的 alpha', () => {
        const resolved = resolveThemeColors(
            'light',
            { surface: '#11223366' },
            0.8,
        );

        // 取的是半透明卡片压在页面底上的实际颜色，不是剥掉 alpha 的原色
        expect(resolved.overlaySurface).toBe(
            compositeOver('#11223366', lightColors.background),
        );
        expect(colord(resolved.overlaySurface).alpha()).toBe(1);
    });
});

describe('半透明输入下的派生', () => {
    it('前景按填充压到底色后的实际颜色来选，而不是按它不透明时的样子', () => {
        // 近乎全透的黑主色，实际呈现接近浅色页面底 → 前景必须是深色
        const resolved = resolveThemeColors(
            'light',
            { primary: '#0000001A' },
            null,
        );
        const actualFill = compositeOver(resolved.primary, resolved.background);

        expect(
            colord(resolved.onPrimary).contrast(actualFill),
        ).toBeGreaterThanOrEqual(4.5);
    });

    it('派生的次级 / 禁用文字沿用正文的 alpha，不被 mix 插值出新值', () => {
        const resolved = resolveThemeColors(
            'light',
            { text: '#111111CC' },
            null,
        );

        expect(colord(resolved.textSecondary).alpha()).toBeCloseTo(0.8, 2);
        expect(colord(resolved.textDisabled).alpha()).toBeCloseTo(0.8, 2);
    });
});

describe('弱化派生永不比来源更强', () => {
    it('主色本身是半透明时，primarySoft 不会比它更实', () => {
        const resolved = resolveThemeColors(
            'light',
            { primary: '#FF000019' },
            null,
        );

        // 固定写 12% 会派生出比 10% 主色还实的着色底，弱化角色反而更强
        expect(colord(resolved.primarySoft).alpha()).toBeLessThanOrEqual(
            colord('#FF000019').alpha() + 0.01,
        );
    });

    it('主色不透明时仍取内建表那档，默认主题不变样', () => {
        const resolved = resolveThemeColors(
            'light',
            { primary: '#FF0000' },
            null,
        );

        expect(colord(resolved.primarySoft).alpha()).toBeCloseTo(0.12, 2);
    });

    it('border / ripple 同样不比正文更实', () => {
        const resolved = resolveThemeColors(
            'light',
            { text: '#11111114' },
            null,
        );

        expect(colord(resolved.border).alpha()).toBeLessThanOrEqual(
            colord('#11111114').alpha() + 0.01,
        );
        expect(colord(resolved.ripple).alpha()).toBeLessThanOrEqual(
            colord('#11111114').alpha() + 0.01,
        );
    });
});

describe('半透明填充按最差容器保底', () => {
    it('页面底与卡片面明暗相反时，前景取最差情况更好的那个', () => {
        // 白页面 + 黑卡片，50% 的近黑主色：压在页面上得 #888、压在卡片上得 #080808。
        // 只按页面底算会选黑字（在页面上 19:1，可在卡片里只剩 1.04:1）；
        // 取最差情况则选白字，两处分别是 3.54:1 与 19:1，哪一处都还能看
        const resolved = resolveThemeColors(
            'light',
            { background: '#FFFFFF', surface: '#000000', primary: '#10101080' },
            null,
        );

        expect(resolved.onPrimary).toBe('#ffffff');
    });

    it('派生能复现内建表：内建主色交给派生也得到白字', () => {
        // 纯比对比度会给黑（橙上黑字 6.45 > 白字 3.25），可内建表给的就是白。
        // 派生本该能复现它所服务的那张表，否则用户一改主色配色就换了个风格
        const resolved = resolveThemeColors(
            'light',
            { primary: lightColors.primary },
            null,
        );

        expect(resolved.onPrimary).toBe(lightColors.onPrimary.toLowerCase());
    });

    it('白字连 3:1 都够不到时才退回黑', () => {
        // 亮黄上白字只有 1.6，那是真看不清，观感偏好让位给可读性
        const resolved = resolveThemeColors(
            'light',
            { primary: '#FFC107' },
            null,
        );

        expect(resolved.onPrimary).toBe('#000000');
    });

    it('状态填充同样优先白字', () => {
        // 取一个纯比大小会选黑的（白 3.65、黑 5.74），否则两种实现同解、抓不住回归
        const resolved = resolveThemeColors(
            'light',
            { danger: '#FF2C55' },
            null,
        );

        expect(resolved.onDanger).toBe('#ffffff');
    });

    it('主色不透明时前景与只按页面底算的结果一致', () => {
        const resolved = resolveThemeColors(
            'light',
            { background: '#FFFFFF', surface: '#000000', primary: '#0B57D0' },
            null,
        );

        expect(resolved.onPrimary).toBe('#ffffff');
    });

    it('onPrimarySoft 按 primarySoft 压出来的底校验，而不是页面底', () => {
        // #111111 上铺 16% 的 #606060 得到 #222 一档的着色底，比页面底亮了一截。
        // 按页面底校验会停在 #7c7c7c——它在真正承载文字的着色底上只有 4:1
        const resolved = resolveThemeColors(
            'dark',
            { background: '#111111', primary: '#606060' },
            null,
        );
        const softFill = compositeOver(
            resolved.primarySoft,
            resolved.background,
        );

        expect(
            colord(resolved.onPrimarySoft).contrast(softFill),
        ).toBeGreaterThanOrEqual(4.5);
    });
});
