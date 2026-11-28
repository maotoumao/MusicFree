import { colord } from '@/utils/color';

import { palette } from './palette';

/** palette 色 + 不透明度 → rgba（避免手写 rgba 重复 palette 色值） */
function alpha(hex: string, a: number): string {
    return colord(hex).alpha(a).toRgbString();
}

/**
 * 沉浸式正在播放页令牌：恒定深色处理，不随浅深主题翻转
 * 封面永远是深色模糊底，故文字恒浅、遮罩恒近黑
 * **强调色是例外**：它是「这个 app 的强调色」，用户改了主色就该跟着走
 * （见 resolveThemeColors 的派生；没覆盖主色时仍是内建这两档暖橙）
 */
const coverImmersive = {
    coverText: palette.neutral0,
    coverTextSecondary: alpha(palette.neutral0, 0.78),
    coverBorder: alpha(palette.neutral0, 0.16),
    coverVeil: palette.coverVeilDark,
    coverScrim: alpha(palette.neutral1000, 0.66),
    coverAccent: palette.brandOrange400,
    coverAccentStrong: palette.brandOrange550,
    onCoverAccentStrong: palette.neutral0,
};

/**
 * 沉浸播放页背景的合成参数：`Backdrop` 按它渲染，主题派生按它算「实际底色」
 *
 * 放在这里而不是留在组件里，是因为**两处必须是同一组数**：派生强调色时要知道那一页
 * 真正的底色是什么（那不是裸 `coverVeil`——模糊封面压在上面，再叠一层竖直渐变），
 * 各写一份迟早会漂
 */
export const coverBackdrop = {
    /** 模糊封面的不透明度：越出屏沿放大后半透叠在近黑底上 */
    artOpacity: 0.65,
    /**
     * 算「这一页实际底色」时按哪种封面取最坏情况
     *
     * 纯白：封面越亮，压出来的底越亮、其上的文字与强调色越糊。实拍白底专辑封面很常见，
     * 按它算才两头都站得住。（此前借用了派生里的 `LIGHT_FOREGROUND`——那个常量的语义是
     * 「实心填充上的浅色前景」，与「最坏情况的封面」是两件事，同值不同义）
     */
    worstCaseArt: palette.neutral0,
    /** 竖直 scrim 的四档 alpha 与位置：顶压、上四分留一点、中段稍透、底段重 */
    scrimAlphas: [0.4, 0.2, 0.55, 0.96],
    scrimLocations: [0, 0.28, 0.62, 1],
    /**
     * 派生强调色时按哪一档 scrim 算底色（屏幕纵向比例）
     *
     * **不能取渐变最后一项**：0.96 只在屏幕最底那一行成立，而承载强调色的控件都在它上面。
     * 竖屏实测（进度轨心 = 高 − 下安全区 − 135，播放键心 = − 56）：进度落在 0.76~0.82、
     * 播放键落在 0.89~0.91，故取 0.80 这一档。它**不是**这些位置里最亮的那一处
     * （0.76 那一侧还要亮一点）——绝对门槛本来就兑现不了，兜住各处的是
     * 「不低于内建那一档」那条不变量，它在整条纵轴上成立（见 resolveThemeColors.test）。
     *
     * 另外 `coverAccent` 面积最大的消费者是歌词当前行。歌词画布夹在顶栏与歌词工具行之间，
     * 实算纵向落在 0.09~0.73（当前行自动居中，稳态在 0.34~0.42）——**整条都在这一档之上**、
     * 即遮罩更薄的一侧，那一处的弱是知情取舍，靠同时保留的 1.05 缩放兜底。
     *
     * 短窗口分栏（NowPlayingPanes 的 strip / brief 档）的传输簇是垂直居中的，播放键心最高
     * 能升到约 0.31（窗口高 220dp、下安全区 60）——越靠上越贴近遮罩最薄那一带；
     * 那一带有色相的强调色都撑不住（内建橙对进度轨也只有 1.18~1.72；纯白尚有 3.3~4.8），
     * 不是取哪一档能解决的问题；
     * 派生只保证「同一位置上不低于内建那两档」，这条在各高度上都成立（见 resolveThemeColors.test）
     */
    accentBandLocation: 0.8,
} as const;

/** 内建配色底表的方向；主题按它决定继承哪一套 */
export type ColorScheme = 'light' | 'dark';

/** 主题对语义色的覆盖；缺席的角色继承内建表或由上游角色派生 */
export type ThemeColorOverride = Readonly<
    Partial<Record<keyof Colors, string>>
>;

/**
 * 语义颜色契约：UI 只认这些角色，禁裸 hex / 禁直引 palette
 * 配对规则：中性填充（background/surface/surfaceVariant）的前景复用 text*；
 * 着色填充（primary/状态）各自配 onX 前景
 */
export interface Colors {
    /** 页面底 */
    background: string;
    /** 抬升容器：卡片/浮层/菜单/底栏 */
    surface: string;
    /** 内陷/次级表面：输入框底、选中行底 */
    surfaceVariant: string;
    /**
     * 模态浮层面：Dialog / Panel / Toast
     * 取值是 `surface` 压在页面底（`background`）上的实际颜色（合成期覆写），下方底表里的
     * 字面量只为满足类型完整性。它恒不透明：既不吃「控件不透明度」——那条旋钮是给壁纸场景的
     * 常驻 chrome 用的——也不跟用户给 `surface` 设的 alpha，模态面半透明只会让底下的文字叠进来
     */
    overlaySurface: string;
    /** 主内容文字（高强调） */
    text: string;
    /** 次内容文字（中强调） */
    textSecondary: string;
    /** 禁用文字（低强调） */
    textDisabled: string;
    /** 品牌主色：按钮/激活/高亮文字 */
    primary: string;
    /** 品牌填充上的前景 */
    onPrimary: string;
    /** 低透明品牌底：选中/当前播放容器 */
    primarySoft: string;
    /** primarySoft 上的前景 */
    onPrimarySoft: string;
    /** 危险/删除 */
    danger: string;
    onDanger: string;
    /** 成功 */
    success: string;
    onSuccess: string;
    /** 警告 */
    warning: string;
    onWarning: string;
    /** 低透明警告底：只读 / 降级提示条 */
    warningSoft: string;
    /** 信息 */
    info: string;
    onInfo: string;
    /** 分割线/描边/输入框边 */
    border: string;
    /** 模态遮罩 */
    mask: string;
    /** 阴影色 */
    shadow: string;
    /** 按压高亮叠层 */
    ripple: string;
    /** 控件把手（Switch thumb）：恒定浅色，跨轨道底色（中性 / primary / 禁用灰）都保持可辨 */
    knob: string;
    /* —— 沉浸式正在播放页令牌（恒定深色，不随主题翻转；封面永远深色模糊底） */
    /** 封面上主文字 / 图标 */
    coverText: string;
    /** 封面上次级文字 */
    coverTextSecondary: string;
    /** 封面上描边 / hairline */
    coverBorder: string;
    /** 模糊封面遮罩渐变基色（Backdrop 叠 alpha 成竖直 scrim） */
    coverVeil: string;
    /** 封面 scrim 渐变暗端：任意亮度封面上保 coverText / 白图标 ≥4.5:1（集合 / 歌手沉浸头共用） */
    coverScrim: string;
    /** 强调色：进度填充 / 下划线 / 激活态 */
    coverAccent: string;
    /** 更深强调色：主播放键填充（承白色图标、够对比） */
    coverAccentStrong: string;
    /** coverAccentStrong 填充上的前景（内建是白，如播放键图标；派生时按实心色重判） */
    onCoverAccentStrong: string;
}

export const lightColors: Colors = {
    background: palette.neutral50,
    surface: palette.neutral0,
    surfaceVariant: palette.neutral150,
    overlaySurface: palette.neutral0,
    text: palette.neutral750,
    textSecondary: palette.neutral600,
    textDisabled: palette.neutral400,
    primary: palette.brandOrange500,
    onPrimary: palette.neutral0,
    primarySoft: alpha(palette.brandOrange500, 0.12),
    onPrimarySoft: palette.brandOrange600,
    danger: palette.red,
    onDanger: palette.neutral0,
    success: palette.green,
    onSuccess: palette.neutral0,
    warning: palette.amber,
    onWarning: palette.neutral950,
    warningSoft: alpha(palette.amber, 0.12),
    info: palette.blue,
    onInfo: palette.neutral0,
    border: alpha(palette.neutral1000, 0.12),
    mask: alpha(palette.neutral1000, 0.4),
    shadow: palette.neutral1000,
    ripple: alpha(palette.neutral1000, 0.1),
    knob: palette.neutral0,
    ...coverImmersive,
};

export const darkColors: Colors = {
    background: palette.neutral950,
    surface: palette.neutral850,
    surfaceVariant: palette.neutral800,
    overlaySurface: palette.neutral850,
    text: palette.neutral50,
    textSecondary: palette.neutral400,
    textDisabled: palette.neutral600,
    primary: palette.brandOrange400,
    onPrimary: palette.neutral900,
    primarySoft: alpha(palette.brandOrange400, 0.16),
    onPrimarySoft: palette.brandOrange400,
    danger: palette.redBright,
    onDanger: palette.neutral0,
    success: palette.greenBright,
    onSuccess: palette.neutral950,
    warning: palette.amberBright,
    onWarning: palette.neutral950,
    warningSoft: alpha(palette.amberBright, 0.16),
    info: palette.blueBright,
    onInfo: palette.neutral0,
    border: alpha(palette.neutral0, 0.1),
    mask: alpha(palette.neutral1000, 0.6),
    shadow: palette.neutral1000,
    ripple: alpha(palette.neutral0, 0.1),
    knob: palette.neutral0,
    ...coverImmersive,
};
