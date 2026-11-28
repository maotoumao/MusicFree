/**
 * 主题合成：内建底表 → 用户覆盖 → 派生补全 → 背景在场时的半透明面
 *
 * 派生只在其**上游角色被用户覆盖**时启动；上游没被动过就保留内建底表里已验证的值
 * （内建 primarySoft / border 等是手工调过的常量，无条件重算会让默认主题也变样）。
 * 用户显式写入的角色永远优先，派生不会盖掉它——这就是「派生默认自动、写入即解锁手动」。
 */
import { colord, type Colord } from '@/utils/color';

import { compositeOver, mixSrgb } from './colorMath';
import {
    coverBackdrop,
    darkColors,
    lightColors,
    type ColorScheme,
    type Colors,
    type ThemeColorOverride,
} from './tokens/colors';

/** 状态色与其自动前景的配对 */
interface StatusPair {
    readonly fill: keyof Colors;
    readonly foreground: keyof Colors;
    /** 有低透明底色的状态（目前只有 warning） */
    readonly soft?: keyof Colors;
}

/** 派生前景要够正文对比度 */
const MIN_TEXT_CONTRAST = 4.5;
/** UI 组件 / 大号图形的对比度门槛（WCAG 非文本对比度） */
const MIN_GRAPHIC_CONTRAST = 3;
const LIGHT_FOREGROUND = '#ffffff';
const DARK_FOREGROUND = '#000000';
/** 填充上的白字可接受的下限：WCAG 给 UI 组件与大号文字的既有门槛 */
const FILLED_LIGHT_MIN_CONTRAST = 3;
/**
 * 比「内建那一档」高出的这一点余量，用来抵掉 `colord.contrast()` 的两位小数**截断**
 *
 * 内建实心橙对基准的真实比值是 3.3832，`contrast()` 报 3.38。拿 3.38 当下界，
 * 一个真实值 3.3818 的候选色照样过关——它比内建低，正是这条下界要挡的东西。
 * 加一个量化步长，「不低于内建」才是真的（实测把 4096 点网格上的 46 个反例清零）
 */
const CONTRAST_QUANTUM = 0.01;
/** 派生 primarySoft / warningSoft 的着色底透明度上限：对齐内建表的取值 */
const SOFT_ALPHA: Record<ColorScheme, number> = { light: 0.12, dark: 0.16 };
/** 次级 / 禁用文字向页面底色靠拢的比例；两档拉开，保住 text > textSecondary > textDisabled 的强调序 */
const TEXT_SECONDARY_MIX = 0.3;
const TEXT_DISABLED_MIX = 0.55;
const BORDER_ALPHA = 0.12;
const RIPPLE_ALPHA = 0.1;

const STATUS_PAIRS: readonly StatusPair[] = [
    { fill: 'danger', foreground: 'onDanger' },
    { fill: 'success', foreground: 'onSuccess' },
    { fill: 'warning', foreground: 'onWarning', soft: 'warningSoft' },
    { fill: 'info', foreground: 'onInfo' },
];

/**
 * 解析当前生效的语义颜色
 * @param scheme 主题继承的内建底表方向
 * @param overrides 用户覆盖（已由 core 规范为 HEX）
 * @param surfaceOpacity 有自定义背景时施加到抬升面的不透明度；null 表示无背景
 */
function resolveThemeColors(
    scheme: ColorScheme,
    overrides: ThemeColorOverride,
    surfaceOpacity: number | null,
): Colors {
    const base = scheme === 'dark' ? darkColors : lightColors;
    const merged: Colors = { ...base, ...overrides };
    const resolved: Colors = {
        ...merged,
        ...deriveColors(scheme, merged, overrides),
    };
    // 模态浮层恒不透明：取 surface 压在页面底上的**实际颜色**——既不吃控件不透明度，也不跟
    // 用户给 surface 设的 alpha。壁纸场景下卡片半透明是想让背景透出来，弹窗 / 面板半透明只会
    // 让底下的列表文字叠进正文里。压底而不是直接剥 alpha：浅色主题上 20% 的黑卡片看着是浅灰，
    // 剥成纯黑会把深色正文一起吞掉
    resolved.overlaySurface = compositeOver(
        resolved.surface,
        resolved.background,
    );
    if (surfaceOpacity === null) {
        return resolved;
    }
    return {
        ...resolved,
        surface: scaleAlpha(resolved.surface, surfaceOpacity),
        surfaceVariant: scaleAlpha(resolved.surfaceVariant, surfaceOpacity),
    };
}

/** 只补「上游被覆盖、自身未被覆盖」的角色 */
function deriveColors(
    scheme: ColorScheme,
    merged: Colors,
    overrides: ThemeColorOverride,
): Partial<Colors> {
    const derived: Partial<Colors> = {};
    const bases = containerBases(merged);
    const coverBases = coverAccentBases(merged);
    if (overrides.primary) {
        // 用户选定的主色原样保留（不为对比度回调），只让派生出的配套色可读
        setIfInherited(derived, overrides, 'onPrimary', () =>
            pickFilledForeground(fillsOn(merged.primary, bases)),
        );
        const soft = softenAlpha(merged.primary, SOFT_ALPHA[scheme]);
        setIfInherited(derived, overrides, 'primarySoft', () => soft);
        setIfInherited(derived, overrides, 'onPrimarySoft', () =>
            // 底是 primarySoft 压出来的颜色，不是页面底色：soft 是着色底，
            // 拿页面底去校验会算出一个在真实底上根本不够看的灰
            adjustForContrast(
                colord(merged.primary).alpha(1),
                fillsOn(overrides.primarySoft ?? soft, bases),
                MIN_TEXT_CONTRAST,
            ).toHex(),
        );
        /*
         * 沉浸播放页的强调色跟着主色走，但**不能直接等于主色**：主色是给页面底 / 卡片面
         * 配的，而这几个角色压在那一页的深色背景上。深蓝 #0d47a1 在那里只有 2.2、
         * 深紫 2.1、近黑 1.0——原样搬过去，进度条与播放键会糊进背景里看不见
         *
         * 基准是**控件所在那一带**的合成底色（`coverAccentBases`），既不是裸 `coverVeil`
         * （那一页没有任何一处的底色等于遮罩原色），也不是渐变最后一档（0.96 只在屏幕
         * 最底那一行成立，控件都在它上面）。这一页在浅色封面上本来就没有 AA 余量——
         * 纯白文字在渐变最薄处也只有 3.38、内建橙 1.22——所以派生真正保证的不是某个
         * 绝对门槛，而是**同一位置上不低于它替换掉的内建那两档**（测试按各高度钉住）
         */
        /*
         * 两道门保留绝对值（4.5 / 3），尽管这一页兑现不了它们——内建橙在控件那一带对底
         * 只有 4.37、对进度轨 2.65，本来就没过。留着是因为它们撑出的余量正是
         * 「派生在**任意**高度都不低于内建」的来源：试过改成「以内建档为地板」，
         * 门槛处等对比度并不能保证换个底色后还等——实测某些高度掉到 1.00 vs 内建 1.03
         *
         * 代价是用户在取色器里原样选中内建主色时，accent 会被抬成一个略浅的橙
         * （#ff6f3c → #ff8256，对底 4.37→4.94、对轨 2.65→3.00）。两害相权取这一头：
         * 各处都不比默认糟，胜过「选中默认色时逐字节相同」
         */
        setIfInherited(derived, overrides, 'coverAccent', () =>
            // 分开抬：对底色（它也当激活态文字用），对进度轨要能看出「填充 / 轨道」
            // 这条边界——轨道自己是压在同一个底上的 coverBorder，比底色亮
            adjustForContrast(
                adjustForContrast(
                    colord(merged.primary).alpha(1),
                    [coverBases.band],
                    MIN_TEXT_CONTRAST,
                ),
                [coverBases.track],
                MIN_GRAPHIC_CONTRAST,
            ).toHex(),
        );
        /*
         * 实心档先抬到「在底色上看得见」，再朝**暗**走到浅色前景够用为止
         *
         * 内建表的 400 / 550 就是这个关系（白在 400 上只有 2.77、在 550 上 3.58），
         * 派生本该能复现它所服务的那张表。少了后半步，用户在取色器里原样选中内建主色，
         * 播放键会既变亮、图标又翻黑——那种「我什么都没改却变样了」最难解释
         *
         * 抬的下界取**内建 550 在同一基准上的对比度**（3.38），不写魔数：内建表将来调了
         * 自动跟上。读内建底表而不是 `merged`——这个分支只判了 `overrides.primary`，
         * 用户可以同时覆盖 `coverAccentStrong`，那时 `merged` 里放的是他的值，
         * 拿它当「内建下界」自相矛盾（两者当下输出相同，故这是去矛盾、不是修可见 bug）
         */
        const builtinScheme = scheme === 'dark' ? darkColors : lightColors;
        const strongMin = Math.max(
            MIN_GRAPHIC_CONTRAST,
            colord(builtinScheme.coverAccentStrong).contrast(coverBases.band) +
                CONTRAST_QUANTUM,
        );
        const strong = darkenForLightForeground(
            adjustForContrast(
                colord(merged.primary).alpha(1),
                [coverBases.band],
                strongMin,
            ),
            [coverBases.band],
        ).toHex();
        setIfInherited(derived, overrides, 'coverAccentStrong', () => strong);
    }
    /*
     * 实心档的前景按**最终生效**的实心色判：用户显式覆盖了它就按覆盖值（否则把播放键填成
     * 白色时图标还是白的），没覆盖就按刚派生出来的；两边都没动就保留内建配对。
     * 实心色可以带 alpha，量对比度前先压到它所在的那一带底色上——20% 的白压在深底上
     * 看着是暗的，直接读 r/g/b 会判成「白底配黑图标」
     */
    const strongInEffect =
        overrides.coverAccentStrong ?? derived.coverAccentStrong;
    if (strongInEffect) {
        setIfInherited(derived, overrides, 'onCoverAccentStrong', () =>
            pickFilledForeground(fillsOn(strongInEffect, [coverBases.band])),
        );
    }
    for (const pair of STATUS_PAIRS) {
        if (!overrides[pair.fill]) {
            continue;
        }
        setIfInherited(derived, overrides, pair.foreground, () =>
            pickFilledForeground(fillsOn(merged[pair.fill], bases)),
        );
        if (pair.soft) {
            setIfInherited(derived, overrides, pair.soft, () =>
                softenAlpha(merged[pair.fill], SOFT_ALPHA[scheme]),
            );
        }
    }
    if (overrides.text || overrides.background) {
        setIfInherited(derived, overrides, 'textSecondary', () =>
            dimText(merged.text, merged.background, TEXT_SECONDARY_MIX),
        );
        setIfInherited(derived, overrides, 'textDisabled', () =>
            dimText(merged.text, merged.background, TEXT_DISABLED_MIX),
        );
        setIfInherited(derived, overrides, 'border', () =>
            softenAlpha(merged.text, BORDER_ALPHA),
        );
        setIfInherited(derived, overrides, 'ripple', () =>
            softenAlpha(merged.text, RIPPLE_ALPHA),
        );
    }
    return derived;
}

/**
 * 半透明填充可能压在的容器：页面底，以及卡片 / 弹窗面压在页面底之后的样子
 *
 * 半透明色**不存在唯一的「实际颜色」**——同一个主色按钮在页面上、卡片里、弹窗里
 * 各是一个样。派生前景时按这组容器取最差情况，保证哪一处都不会翻车。
 * 此处的 `surface` 尚未乘控件不透明度，乘完只会落在两者之间，仍被这个区间兜住。
 * 主色不透明时两个容器合成出的就是同一个颜色，行为与只按页面底算完全一致。
 */
function containerBases(merged: Colors): readonly string[] {
    const page = merged.background;
    const card = compositeOver(merged.surface, page);
    return card === page ? [page] : [page, card];
}

/** 同一个填充压在各个容器上之后的实际颜色 */
function fillsOn(fill: string, bases: readonly string[]): readonly string[] {
    return bases.map(base => compositeOver(fill, base));
}

/**
 * 弱化派生：把来源压到目标透明度，但**永不比来源更强**
 *
 * 目标值是照着内建表定的绝对量，对不透明来源直接取它即可。可一旦用户把主色本身
 * 设成 10% 透明，固定写 12% 就会派生出一个比主色还实的着色底——弱化角色反而更强。
 * 叠乘同样不行（0.1×0.12 直接消失），取小既守住默认值又保住强弱序。
 */
function softenAlpha(color: string, target: number): string {
    const parsed = colord(color);
    return parsed.alpha(Math.min(parsed.alpha(), target)).toRgbString();
}

/**
 * 把正文色朝页面底色压淡，得到次级 / 禁用档
 * 先摘掉 alpha 再混、最后原样还回去：colord 的 mix 会把 alpha 一起插值，
 * 派生出的角色会带上一个没人选过的透明度
 */
function dimText(text: string, background: string, ratio: number): string {
    const parsed = colord(text);
    return parsed.alpha(1).mix(background, ratio).alpha(parsed.alpha()).toHex();
}

function setIfInherited(
    derived: Partial<Colors>,
    overrides: ThemeColorOverride,
    role: keyof Colors,
    compute: () => string,
): void {
    if (overrides[role] === undefined) {
        derived[role] = compute();
    }
}

/**
 * 在已有 alpha 之上再乘一道，而不是把它顶掉
 *
 * 「控件不透明度」是背景那一档的全局旋钮，用户给 `surface` 单设的 alpha 是逐角色的意图，
 * 两者是两件事、应当叠乘。直接 `alpha(x)` 会让后者被前者整个覆盖——用户把卡片调到 40%，
 * 有背景图时却仍按默认的 80% 渲染，正好是这项能力最该生效的场景。
 */
function scaleAlpha(color: string, factor: number): string {
    const parsed = colord(color);
    return parsed.alpha(parsed.alpha() * factor).toRgbString();
}

/** 竖直 scrim 在某一纵向比例处的 alpha：与 Backdrop 的 LinearGradient 同一组数、同一段线性插值 */
function scrimAlphaAt(location: number): number {
    const stops = coverBackdrop.scrimLocations;
    const alphas = coverBackdrop.scrimAlphas;
    if (location <= stops[0]) {
        return alphas[0];
    }
    for (let i = 1; i < stops.length; i += 1) {
        const to = stops[i];
        const from = stops[i - 1];
        if (to !== undefined && from !== undefined && location <= to) {
            const span = to - from;
            const ratio = span === 0 ? 0 : (location - from) / span;
            return alphas[i - 1]! + (alphas[i]! - alphas[i - 1]!) * ratio;
        }
    }
    return alphas[alphas.length - 1]!;
}

/**
 * 强调色承载的那一带的实际底色，以及压在它上面的进度轨
 *
 * 最坏情况按**纯白封面**算：模糊封面按 `artOpacity` 压在遮罩上，再叠该处的 scrim。
 * 白封面很常见（实拍白底专辑封面），按它算出来的底最亮，据此派生才两头都站得住。
 * 取哪一档见 `coverBackdrop.accentBandLocation`——**不是**渐变最后一项，那一档只在
 * 屏幕最底那一行成立，而控件都在它上面（曾按最后一项算，实测承诺的门槛全线破）
 */
function coverAccentBases(colors: Colors): { band: string; track: string } {
    const artOnVeil = mixSrgb(
        colors.coverVeil,
        coverBackdrop.worstCaseArt,
        coverBackdrop.artOpacity,
    );
    const band = mixSrgb(
        artOnVeil,
        colors.coverVeil,
        scrimAlphaAt(coverBackdrop.accentBandLocation),
    );
    return { band, track: compositeOver(colors.coverBorder, band) };
}

/**
 * 从实心色朝**暗**走，直到浅色前景在它上面够用；再暗就在底色上看不见了就停
 * 停下来时前景交给 `pickFilledForeground` 判——那时它会如实翻成深色前景
 */
function darkenForLightForeground(
    color: Colord,
    bases: readonly string[],
): Colord {
    let candidate = color;
    for (let step = 0; step < 100; step += 1) {
        if (
            colord(candidate.toHex()).contrast(LIGHT_FOREGROUND) >=
            FILLED_LIGHT_MIN_CONTRAST
        ) {
            return candidate;
        }
        const darker = candidate.darken(0.01);
        // 护栏，按今天的常量**可证明触发不到**：退出条件 contrast(白, c) ≥ 3 ⟺ L(c) ≤ 0.300，
        // 这道守卫 contrast(c, band) ≥ 3 ⟺ L(c) ≥ 0.220，而 band 由 coverVeil 定、
        // 不在 ThemeColorRole 里、任何覆盖都动不了它。留着是为了遮罩真调暗时不失守；
        // 真跌破了，测试里那条「各高度不低于内建」的用例会红
        if (minContrast(colord(darker.toHex()), bases) < MIN_GRAPHIC_CONTRAST) {
            return candidate;
        }
        candidate = darker;
    }
    return candidate;
}

/**
 * 保持色相、朝**实际底色**的反方向逐步移动，直到在每个容器上都达到目标对比度
 * 方向取自底色本身而非主题的浅深：用户可以在浅色主题里把页面底调成黑的，
 * 按主题方向盲目加深只会越走越糊，最后交出黑底黑字
 */
function adjustForContrast(
    color: Colord,
    bases: readonly string[],
    minimum: number,
): Colord {
    // 按**量化到 8 位后**的样子判：调用方交出去的是 `.toHex()`，
    // 拿全精度值判会在门槛边上收工，落地一量化就掉到门槛之下（实测 4.49 vs 4.5）
    const reaches = (candidate: Colord) =>
        minContrast(colord(candidate.toHex()), bases) >= minimum;
    if (reaches(color)) {
        return color;
    }
    // 容器们明暗不一时按多数定向；单容器时与「底色偏暗就往亮走」逐字等价
    const darkBases = bases.filter(base => colord(base).isDark()).length;
    const towardLight = darkBases * 2 >= bases.length;
    let candidate = color;
    for (let step = 0; step < 100; step += 1) {
        candidate = towardLight
            ? candidate.lighten(0.01)
            : candidate.darken(0.01);
        if (reaches(candidate)) {
            return candidate;
        }
    }
    // 容器跨度太大时无解（白页面 + 近黑卡片），退回最差情况最好的那个极端
    return colord(pickReadableForeground(bases));
}

/** 前景在所有容器上的最低对比度：半透明填充只能按最差的那个容器保底 */
function minContrast(color: Colord, bases: readonly string[]): number {
    return bases.reduce(
        (lowest, base) => Math.min(lowest, color.contrast(base)),
        Number.POSITIVE_INFINITY,
    );
}

/**
 * 填充色上的前景：**优先给白**，只有白连 3:1 都够不到才退回黑
 *
 * 纯比对比度会在任何中高明度的饱和色上选黑——橙 `#f2600a` 上黑字 6.45、白字仅 3.25。
 * 但内建表在同一个橙上给的就是白字，派生本该能复现它所服务的那张表；何况饱和品牌色
 * 配黑字观感廉价，也不合国内外一致的惯例。故以「白字够不够用」为判据而非「谁更高」。
 * 内建的十对填充 / 前景里，这条规则复现九对；唯一分歧是浅色 warning（白字 3.18，
 * 表里选的黑），而内建值永不走派生——派生只在用户覆盖了上游角色时才启动。
 */
function pickFilledForeground(bases: readonly string[]): string {
    if (
        minContrast(colord(LIGHT_FOREGROUND), bases) >=
        FILLED_LIGHT_MIN_CONTRAST
    ) {
        return LIGHT_FOREGROUND;
    }
    return pickReadableForeground(bases);
}

/**
 * 白与黑里选**最差情况更好**的那个，而不是在某一个容器上最好的那个
 * 这条是可读性兜底（`adjustForContrast` 走投无路时用），只认对比度、不掺观感偏好
 */
function pickReadableForeground(bases: readonly string[]): string {
    return minContrast(colord(LIGHT_FOREGROUND), bases) >=
        minContrast(colord(DARK_FOREGROUND), bases)
        ? LIGHT_FOREGROUND
        : DARK_FOREGROUND;
}

export { resolveThemeColors };
