import {
    iconButtonEdgeInset,
    iconButtonShellPad,
} from '@/components/ui/iconButtonGeometry';
import { fontSize, layout, lineHeightMultiplier, space } from '@/design';

import type { ViewStyle } from 'react-native';

/**
 * 正在播放页的布局（纯计算）
 *
 * - phone·tall（竖屏）：只经 playerFormFor 判一次形态，之后不再调用这里的任何函数——
 *   PagerView 翻页版按静态样式原样渲染
 * - phone·panes（横屏 / 超矮窗口）：左栏封面 + 其下的进度条，右栏标题 / 歌词 / 控件（NowPlayingPanes）
 * - phone·compact（分屏等矮窗口）：仍翻页，但换上短窗口 chrome
 * - tabletPortrait：仍翻页，但内容列居中封顶 playerContentMaxWidth（封面不再撑满 800）
 * - tabletLandscape：封面 + 歌词并排（NowPlayingWide），左栏宽按可用宽收窄
 */

/**
 * 竖屏平板：把 560 的内容列居中所需的左右内距（dp）
 *
 * 用对称内距而不是 maxWidth + alignSelf：翻页页面是 PagerView 的直接子节点，原生 pager 把子页
 * 按左上角摆放、宽度取子页自身测得的宽——maxWidth 一收窄就贴左。内距让页面仍满宽、内容居中
 */
export function playerContentInsetFor(availableWidth: number): number {
    return Math.max(
        layout.gutter.tablet,
        (availableWidth - layout.playerContentMaxWidth) / 2,
    );
}

/** 竖屏平板：翻页页面与底部控件共用的内距样式（页面自带 16 内距 → 换成居中所需内距） */
export function playerColumnFor(contentInset: number): ViewStyle {
    return { paddingHorizontal: contentInset };
}

/** 横屏两栏容器的外内距（dp）：栏内再各留 16 给满幅工具行，内容线落在 48 */
export const WIDE_OUTER_GUTTER = layout.gutter.tablet;

/**
 * 竖屏平板顶栏内容行：图标落在 560 内容列的边线上
 * 两端是贴边图标按钮，外推壳内留白后图标本体落在内容线上
 */
export function playerPortraitNavRowFor(contentInset: number): ViewStyle {
    return { paddingHorizontal: iconButtonEdgeInset(contentInset) };
}

/** 横屏平板顶栏内容行：图标落在 48 内容线（32 外距 + 16 栏内距） */
export const PLAYER_WIDE_NAV_ROW: ViewStyle = {
    paddingHorizontal: iconButtonEdgeInset(
        WIDE_OUTER_GUTTER + layout.gutter.compact,
    ),
};

/** 横屏左栏宽（dp）：常规平板取 token，窄折叠屏（如 840 宽）收到窗口宽的一半 */
export function playerLeadWidthFor(windowWidth: number): number {
    return Math.min(layout.playerLeadWidth, windowWidth / 2);
}

/** 横屏封面封顶边长（dp）：左栏 520 时封面 400；窄栏按比例收 */
export function playerCoverMaxSizeFor(leadWidth: number): number {
    return Math.round((leadWidth * 400) / layout.playerLeadWidth);
}

// —— 手机短窗口（横屏 / 分屏 / 自由窗口）——

/**
 * 竖屏封面页那块定高身份区**在页面里实际占的高**（dp）：
 * `CoverStage.META_HEIGHT`（2 行 2xl 标题 + 间距 + 1 行 md 艺人 = 86.75）+ 它自己的 `marginTop`
 *
 * 上边距必须算进来——它和定高一样从封面那份 `flex: 1` 里扣，漏掉就会把翻页版的地板
 * 低估 12dp（判据算出的封面比渲染出来的多 12）
 */
const PLAYER_PORTRAIT_META_BLOCK = Math.ceil(
    fontSize['2xl'] * lineHeightMultiplier.tight * 2 +
        space.sm +
        fontSize.md * lineHeightMultiplier.tight +
        space.md,
);

/**
 * 手机形态：结构分叉的判据，只吃窗口尺寸（与 useLayoutClass 同纪律）
 * - tall：竖屏，今天的翻页版，一行不改
 * - panes：分栏——左栏封面 + 其下的进度条，右栏标题 / 歌词 / 控件（NowPlayingPanes）
 * - compact：仍翻页，但换上短窗口 chrome（左右分屏 / 上下分屏）
 *
 * 走 panes 的有两类窗口：一类是宽远大于高的横屏（翻页版在那里会把封面挤到 1dp）；
 * 一类是矮到翻页版的定高块都塞不下的窗口（那里翻页版会直接溢出窗口）。分栏形态自己
 * 还有三档降级，能一路缩到 Android 多窗口的 220dp 地板，故兜底交给它
 */
export type PlayerForm = 'tall' | 'panes' | 'compact';

/** 竖屏顶栏高（dp）；NowPlayingNav 从此处取，让判据与渲染同源 */
export const PLAYER_NAV_HEIGHT = 52;
/** 短窗口顶栏高（dp）：比竖屏的 52 收一档；命中区仍由 IconButton 保 44 */
export const PLAYER_COMPACT_NAV_HEIGHT = 44;
/** 短窗口页面底距（dp）：竖屏 24 在矮窗口里太奢侈 */
export const PLAYER_COMPACT_BOTTOM = space.md;
/** 分栏两栏间距（dp） */
export const PLAYER_PANES_COLUMN_GAP = space.xl;
/** 短窗口顶栏尾部那两键（收藏 + 更多）的外宽（dp）：两个命中壳 + xs 间距 */
export const PLAYER_TOOLS_MENU_WIDTH = 2 * layout.hitTarget + space.xs;

/**
 * 进度块高的**保守上界**（dp）：SeekBar 命中区 + 时间行，减去时间行的负上边距
 *
 * 时间行没传 lineHeight（那两个 Text 归竖屏路径共用，动它就动了「竖屏一行不改」），
 * 故真实行高由各端原生字体度量定；纯数字 + `includeFontPadding: false` 实测约 1.2em，
 * 这里按 normal(1.4) 记账 —— 预算只多算不少算，各档门槛因此是安全侧
 */
export const PLAYER_PROGRESS_HEIGHT = Math.ceil(
    layout.hitTarget + fontSize.xs * lineHeightMultiplier.normal - space.sm,
);
/** 主播放键直径三档（dp）：竖屏 64、短窗口 56、条带档收到 44（仍是命中地板本身） */
export const PLAYER_PLAY_SIZE_REGULAR = 64;
export const PLAYER_PLAY_SIZE_COMPACT = 56;
export const PLAYER_PLAY_SIZE_DENSE = layout.hitTarget;
/**
 * 控件行的最小外宽（dp）：五个 44 命中壳，两端各向外拉一个壳内留白
 * 五个都是定尺寸、RN 默认不收缩 → 行宽低于此值控件会横向溢出
 */
export const playControlsMinWidth = (playSize: number) =>
    4 * layout.hitTarget + playSize - 2 * iconButtonShellPad('lg');
/**
 * 收窄档的控件行最小外宽（dp）：循环键让位后只剩四个
 *
 * 320dp 窗口若还带 59dp 的横屏刘海（横屏分屏可以给出这种窗口），可用宽只有 227、
 * 栏内宽 195，装不下五键的 212。那时收掉**循环**——它是五个里唯一在别处还有入口的
 * （播放队列面板的头部就有一个），队列 / 上一首 / 播放 / 下一首都留住
 */
export const playControlsTightWidth = (playSize: number) =>
    3 * layout.hitTarget + playSize - 2 * iconButtonShellPad('lg');
const PLAY_CONTROLS_MIN_WIDTH = playControlsMinWidth;

/**
 * 右栏身份区块高（dp）：标题 · 艺人 · 音源**同一行**，故行高由最高的那个子节点定
 *
 * 三者分别是 xl × tight = 25、md × tight = 18.75、Tag（xs × normal + 只有横向内距）= 16.8，
 * `alignItems: 'center'` 下取 max = 25。改造前是两行（xl 标题 + xs 间距 + md 副行 = 48），
 * 横屏最缺高度，合成一行省下的 23dp 全给歌词
 */
const SIDE_IDENTITY_BLOCK = Math.ceil(fontSize.xl * lineHeightMultiplier.tight);
/** 翻页版底部集群高（dp）：进度 + 组间距 + 播放键（compact 档的翻页页面仍把进度带在身上） */
const PAGER_BOTTOM_CLUSTER =
    PLAYER_PROGRESS_HEIGHT + space.md + PLAYER_PLAY_SIZE_COMPACT;
/** 分栏右栏的控件块高（dp）：那行播放控件本身 */
const SIDE_CONTROLS_BLOCK = PLAYER_PLAY_SIZE_COMPACT;
/**
 * 条带档块高（dp）：标题与五键同一行（行高即命中壳 44）+ 紧间距 + 进度
 * 间距只给 xs：SeekBar 的 44 命中区里细轨居中，上方本就有约 20dp 视觉留白
 *
 * 条带档必然没有封面（见 playerPanesMetricsFor），进度因此一定在右栏里
 */
const SIDE_STRIP_BLOCK = layout.hitTarget + space.xs + PLAYER_PROGRESS_HEIGHT;
/** 一行歌词占高（dp）：标准档字号的行高 + LyricLine 自带的上下内距 */
const LYRIC_LINE_HEIGHT = Math.ceil(
    fontSize.lg * lineHeightMultiplier.normal + 2 * space.md,
);
/**
 * 歌词区最小高（dp）：两行 —— 当前行整行 + 上下各露半行邻行，是「还看得出在滚」的下限
 *
 * 它同时要压住 LyricView 里三个不收缩的定高物件，否则会溢出到标题与控件上：
 * 拖拽定位条 44（`top: (viewportH - 44) / 2`，视口更矮会算出负 top）、
 * 空态那组「无歌词 + 搜索键」（lg 行按原生度量约 20 + 间距 12 + 44 命中区 ≈ 76）、以及加载态的 Spinner
 * 两行 96 ≥ 80 ≥ 44，三者都过；再低就必须整块让位（brief 档）
 */
const SIDE_LYRIC_MIN_HEIGHT = 2 * LYRIC_LINE_HEIGHT;

/*
 * 右栏的高度门槛分两套，取哪一套只看**有没有封面**
 *
 * 有封面时进度条排在左栏、封面下方（见 playerPanesMetricsFor 的说明），右栏只排
 * 标题 / 歌词槽 / 控件，门槛因此低 65dp；没封面时左栏整个不出现，进度回到右栏底部
 *
 * **间距按 `stack` 的直接子节点数记账，不按「看得见几样」记账**：歌词槽在 brief 档
 * 高度为零但**照样渲染**（full 与 brief 共用一套构图，见 NowPlayingPanes），
 * 而 flex 的 `gap` 只看相邻子节点、不看子节点高不高。于是
 * 有封面 3 子 → 2 个间距，无封面 4 子（多一条进度）→ 3 个间距。
 * 按「看得见的样数」数间距会把两个 brief 门槛各少算 12dp，那正好是控件侵入页底预留区的量
 */
/** 有封面：标题 25 + 2 个间距 24 + 两行歌词 96 + 控件 56 = 201 */
const SIDE_FULL_WITH_COVER =
    SIDE_IDENTITY_BLOCK +
    2 * space.md +
    SIDE_LYRIC_MIN_HEIGHT +
    SIDE_CONTROLS_BLOCK;
/** 有封面：标题 25 + 2 个间距 24 + 控件 56 = 105（歌词槽在但高度为零，两侧间距仍在） */
const SIDE_BRIEF_WITH_COVER =
    SIDE_IDENTITY_BLOCK + 2 * space.md + SIDE_CONTROLS_BLOCK;
/** 无封面：上面两档各自再加「进度 53 + 第 3 个间距 12」= 266 / 170 */
const SIDE_FULL_NO_COVER =
    SIDE_FULL_WITH_COVER + PLAYER_PROGRESS_HEIGHT + space.md;
const SIDE_BRIEF_NO_COVER =
    SIDE_BRIEF_WITH_COVER + PLAYER_PROGRESS_HEIGHT + space.md;
/** 条带档里标题还站得住的最小栏内宽（dp）：控件行 + 间距 + 一段能读的标题 */
const SIDE_STRIP_IDENTITY_MIN_WIDTH =
    PLAY_CONTROLS_MIN_WIDTH(PLAYER_PLAY_SIZE_DENSE) + space.md + 120;

/**
 * 分栏右栏最小外宽（dp，含栏内左右各 screenGutter）：低于它歌词放不下半行、
 * 控件也会挤成一团。它同时是「够不够并排」的判据来源
 */
const PANES_MIN_SIDE_WIDTH = 300;
/** 分栏封面下限（dp）：比这更小的方块已不承载信息，不如把宽度全给右栏 */
const PANES_MIN_COVER = 120;
/**
 * 左栏「封面 + 进度」这一组不贴栏顶所留的余高（dp）
 *
 * 组是贴栏底排的（`artColumn` 的 `justifyContent: 'flex-end'`），故这 12dp **全部落在
 * 封面上方**，不是上下各 6。组下方的呼吸区是另一笔账，由 `columns.paddingBottom` 出
 */
const PANES_COVER_MARGIN = space.md;
/** 左栏里封面与它下方那条进度的间距（dp）；组件从此处取，让判据与渲染同源 */
export const PANES_COVER_PROGRESS_GAP = space.sm;
/**
 * 左栏里封面左右各想留的内距（dp）——**上限，不是定值**
 *
 * 左栏宽 = 封面 + 2 × 实际内距，封面在其中居中，而**进度条横跨整个左栏**，所以这段内距
 * 同时是「进度轨比封面长」的来源，让进度轨明显宽于封面。
 * 改造前左栏宽恒等于封面边长（封面是方的、由栏高定），于是栏高一定就把左栏宽锁死了
 *
 * 它**只从余量里拿**（见 playerPanesMetricsFor 的 leadPadding）。真机常态窗口
 * （可用 780 × 336）余量 217，拿满 24；而封面被**宽度**封顶时余量按定义就是 0、一点不拿
 *
 * 条件是「封面被宽度封顶」，**不是**「窗口宽落在某一段」：可用宽 500 这种落在下面那条
 * 区间里的窗口，只要够高（如 500 × 260，封面由栏高定在 131）仍有 13 的余量、拿 6
 *
 * 若反过来把 2 × 24 从封面的宽度预算里硬扣，可用宽 476…523 那段刚够并排的窗口会
 * **整个失去封面**（原本还有个贴下限的 120dp 封面）——封面消失比封面小一点是更大的
 * 视觉变化，不值这个价
 */
const PANES_LEAD_PADDING_MAX = space.xl;

/**
 * 翻页版封面下限（dp）：比分栏的 120 松——那里问的是「值不值得占一整栏宽」，
 * 这里问的是「翻页版还撑不撑得住」。封面独占一整页，64 的方块仍认得出是张封面；
 * 再往下才该整页让给分栏
 */
const PAGER_MIN_COVER = 64;
/**
 * 判据里假定的上下安全区（dp）
 *
 * **形态判据**（playerFormFor：换不换组件）只吃窗口尺寸——旋转那一帧 insets 与 window
 * 未必同步，混用会拼出「旧尺寸 + 新安全区」的中间态布局，而那一层的代价是整页重挂。
 * 故这里用常量近似，两个轴都用它（playerFormFor 里也调 playerPanesMetricsFor，
 * 但喂的是这个常量，与渲染那次互不影响）。
 *
 * **分栏内部的档位**（sideForm / showIdentity / showProgress）反过来吃真实 insets：
 * 那几档的全部意义就是「这一档真的装得下」，用常量近似会在安全区更大的窗口上溢出。
 * 代价是 insets 单独变化（系统栏显隐等）且刚好跨过档位门槛时，`LyricView` 会重挂、
 * 丢掉滚动位置与拖拽指示条。取「不溢出」而非「不重挂」——溢出是坏的，重挂只是可惜
 */
const ASSUMED_VERTICAL_INSET = 24;

/**
 * 翻页版身份区被裁的那条线（dp）：身份区 99 + 传输 121 = 220
 * 低于它，定高身份区会被 PagerView 底层的 clipChildren 裁掉、歌词页也不足两行；
 * 再低到 121（只剩传输）底部集群会越过安全区、压到系统栏下
 */
const PAGER_CLIP_LINE = PLAYER_PORTRAIT_META_BLOCK + PAGER_BOTTOM_CLUSTER;
/**
 * 判据用的兜底门槛（dp）= 裁切线 220 + 安全区余量 48 = 268
 *
 * 判据只能用常量安全区（见 ASSUMED_VERTICAL_INSET），渲染却吃真实 insets。真实上下安全区
 * 最坏比假定的 48 多出一倍（状态栏 48 + 导航栏 48 = 96），故门槛必须比裁切线再高 48dp——
 * 否则 412 × 324 这类窗口判据算出栏高 220「刚够」，渲染时真实栏高只有 172，身份区被裁 48dp
 */
const PAGER_DEGRADED_MIN = PAGER_CLIP_LINE + 2 * ASSUMED_VERTICAL_INSET;
/**
 * 顶栏「封面 / 歌词」切换分段的宽裕线（dp）
 * 两个标签（按 4 个 md 字宽估：容得下两字中文，也容得下八来个拉丁字母）
 * + 各自左右 sm 内距 + 分隔线及其左右 xs
 *
 * 它不是硬地板——标签本身可收缩、再窄也只是出省略号（见 NowPlayingNav 的 tabLabel）；
 * 它只用来判断「值不值得为配平再占 48dp」
 */
const NAV_SEGMENT_MIN_WIDTH =
    2 * (4 * fontSize.md + 2 * space.sm) + 1 + 2 * space.xs;
/** 一条工具行的高（dp）：ToolButton 的 44 命中地板 + 行上下各 space.sm */
const PLAYER_TOOL_ROW_HEIGHT = layout.hitTarget + 2 * space.sm;
/**
 * 竖屏完整 chrome 的定高块合计（dp）= 380
 * 顶栏 52 + 身份区 99（含上边距）+ 页面组间距 12 + 工具行 60
 * + 进度 53 + 组间距 16 + 控件 64 + 底距 24；封面是唯一的 flex 区，拿剩下的
 */
const PORTRAIT_FULL_CHROME =
    PLAYER_NAV_HEIGHT +
    PLAYER_PORTRAIT_META_BLOCK +
    space.md +
    PLAYER_TOOL_ROW_HEIGHT +
    PLAYER_PROGRESS_HEIGHT +
    space.lg +
    PLAYER_PLAY_SIZE_REGULAR +
    space.xl;
/**
 * 竖屏保持完整 chrome 的门槛（dp，可用高 = 高 − 上下安全区）= 444
 *
 * 「竖屏一行不改」不能用「高 ≥ 600」来近似——那会把 320 × 533 / 320 × 568 这类
 * 小屏竖屏也判成短窗口，把两条工具行收进溢出菜单。判据改成「完整 chrome 加一块
 * 认得出的封面装得下就不动它」：所有在售机型的竖屏（最小 320 × 568，可用 520）都过线；
 * 而 412 × 450 这种上下分屏（可用 402）过不了线，正是要换布局的那类窗口
 */
const PORTRAIT_TALL_MIN = PORTRAIT_FULL_CHROME + PAGER_MIN_COVER;

/**
 * 并排所需的「宽比高多出来的量」（dp）
 * 由封面 = 栏高推出：栏高 = h − 上下安全区 − 顶栏 − 底距，封面 = 栏高 − 让给进度那一段，
 * 而 w 要装下 封面 + 页面左右内距 + 栏距 + 右栏下限
 *
 * **左栏内距不进这个门槛**。理由是**概念上的**：这个门槛问的是「三栏装不装得下」，
 * 而内距是装得下之后才从余量里分的东西（见 playerPanesMetricsFor 的 leadPadding），
 * 不属于这笔预算。
 *
 * 它**不是**行为上的理由——真把 2 × 24 计回来（门槛从「宽 ≥ 高 + 179」变「+ 227」），
 * 掉出第一道规则的窗口会被第二道 `panes.coverSize > 0` 全部接住：枚举
 * 200…2000dp 宽 × 100…1200dp 高的全部整数窗口，形态改变的**是 0 个**
 * （`700 × 500` 就是例子：错过第一道后封面仍有 296，照样返回 panes）
 *
 * 另外别把这一段和「476…523 会失去封面」搞混：后者是**把内距计入封面的宽度预算**时的
 * 后果（`byWidth ≥ 120 ⟺ 可用宽 ≥ 476`，扣掉 48 变成 ≥ 524），属于
 * PANES_LEAD_PADDING_MAX 与 playerPanesMetricsFor 那两段的账
 */
const PANES_WIDTH_MARGIN =
    PANES_MIN_SIDE_WIDTH +
    2 * layout.screenGutter +
    PLAYER_PANES_COLUMN_GAP -
    (PLAYER_COMPACT_NAV_HEIGHT +
        PLAYER_COMPACT_BOTTOM +
        2 * ASSUMED_VERTICAL_INSET +
        PANES_COVER_MARGIN +
        PLAYER_PROGRESS_HEIGHT +
        PANES_COVER_PROGRESS_GAP);

/** 判据里假定的两栏可用高（dp）：与 playerPanesMetricsFor 的 columnHeight 同式，只是安全区取常量 */
function assumedColumnHeight(height: number): number {
    return (
        height -
        2 * ASSUMED_VERTICAL_INSET -
        PLAYER_COMPACT_NAV_HEIGHT -
        PLAYER_COMPACT_BOTTOM
    );
}

/** 手机形态判据；平板由 useLayoutClass 先分叉（最小边 ≥ 600），不会走到这里 */
export function playerFormFor(width: number, height: number): PlayerForm {
    // 宽远大于高：横屏 / 宽扁窗口，翻页版在这里必然把封面挤没
    if (width >= height + PANES_WIDTH_MARGIN) {
        return 'panes';
    }
    // 竖向窗口且完整 chrome 装得下 → 今天的翻页版，一行不改
    // 能走到这里的最小边必 < 600，故 height ≥ breakpoints.tabletMinEdge 蕴含 width <= height，
    // 也就必然从这条返回 tall
    if (
        width <= height &&
        height - 2 * ASSUMED_VERTICAL_INSET >= PORTRAIT_TALL_MIN
    ) {
        return 'tall';
    }
    /*
     * 剩下的窗口要在「翻页版」与「分栏」之间挑。判据只有一问：**分栏画得出封面吗**
     *
     * - 画得出（≥ 120）→ 分栏。那时封面必比翻页版的大得多（翻页版的封面只剩
     *   `栏高 − 220`），而歌词要么与封面同屏、要么翻页版那边也一样没有。
     * - 画不出（窗口窄，宽度不够并排）→ 留翻页版。它至少还有「封面页 + 歌词页」两页，
     *   而分栏在那里只会落到「无封面、无歌词」的 brief——直到翻页版连身份区都要被裁。
     *
     * 这一问是窗口高度的单调函数（封面画不画只看栏高与栏宽的较小值），故拖动分屏
     * 分隔条穿过任何高度都不会出现「分栏 → 翻页 → 分栏」的往复重挂。
     * 分栏这一段的尺寸按常量安全区试算（两个轴都用它），与渲染那次互不影响
     */
    const panes = playerPanesMetricsFor(
        width - 2 * ASSUMED_VERTICAL_INSET,
        height - 2 * ASSUMED_VERTICAL_INSET,
    );
    if (panes.coverSize > 0) {
        return 'panes';
    }
    return assumedColumnHeight(height) >= PAGER_DEGRADED_MIN
        ? 'compact'
        : 'panes';
}

/**
 * 短窗口顶栏的首部占位宽（dp，0 = 不放）
 *
 * 尾键从默认的单个图标（44）换成「收藏 + 更多」（92）后，中段那截 `flex: 1` 会被挤偏
 * 24dp，切换分段与跟手下划线整体离开光学中心；补一段等宽占位即回正。
 * **但窄窗口补不起**：320dp 窗口扣掉安全区只剩 272，补完中段仅 80dp，
 * 标签会被压到出省略号。那时宁可偏 24dp 也不占那 48dp——偏一点只是不居中，
 * 压窄标签是真的读不出来
 */
export function playerCompactNavLeadingFor(availableWidth: number): number {
    const leading = PLAYER_TOOLS_MENU_WIDTH - layout.hitTarget;
    const segment =
        availableWidth -
        2 * iconButtonEdgeInset(layout.screenGutter) -
        layout.hitTarget -
        PLAYER_TOOLS_MENU_WIDTH;
    return segment - leading >= NAV_SEGMENT_MIN_WIDTH ? leading : 0;
}

/**
 * 右栏形态（高度决定，自上而下三档降级）
 * - full：标题钉栏顶 / 歌词吃满中段 / 控件钉栏底——常态横屏
 * - brief：同一构图，只是歌词露不满两行、那一段留空——**构图与 full 一致**，
 *   不再把三样挤成一簇居中（那样封面独占满栏高、右栏一大片空，是改造前最丑的一档）
 * - strip：标题并入控件行 + 进度在下——连 brief 都放不下（≈220dp 高的多窗口地板）
 *
 * 门槛取哪一套由「有没有封面」决定：有封面时进度在左栏，右栏的账少 65dp
 */
export type PlayerSideForm = 'full' | 'brief' | 'strip';

/** 分栏形态的尺寸与取舍 */
export interface PlayerPanesMetrics {
    /**
     * 两栏可用高（dp）= 可用高 − 顶栏 − 底距
     * 渲染不直接用它（高度由 flex 分配）；它是各档门槛的自变量，导出供单测钉住算术
     */
    columnHeight: number;
    /**
     * 左栏里封面左右各留的内距（dp）；左栏宽 = `coverSize + 2 * leadPadding`
     *
     * 只从余量里拿，故窄窗口会是 0（见 playerPanesMetricsFor）。进度条横跨整个左栏，
     * 所以这一段就是「进度轨比封面长」的量。`coverSize` 为 0 时它也是 0
     */
    leadPadding: number;
    /**
     * 封面边长（dp）；**0 = 不画封面**（窗口太扁，左栏整个不出现）
     * 封面是方的、由栏高定，再受「右栏不得低于下限」约束；**左栏宽不是它**，而是
     * `coverSize + 2 * leadPadding`（进度条横跨整个左栏，故比封面长）。
     * 栏高里还要先扣掉封面下方那条进度（进度归左栏），故封面比栏高小 73dp
     *
     * 它同时决定进度条排在哪：> 0 排左栏封面下方，= 0 回到右栏底部
     */
    coverSize: number;
    /** 右栏形态 */
    sideForm: PlayerSideForm;
    /**
     * 条带档里标题是否还画（栏内宽装不下「控件行 + 一段能读的标题」就整块让位）
     * 非条带档恒 true——那两档标题独占一行、不与控件争宽
     */
    showIdentity: boolean;
    /**
     * 进度条是否还画：只有条带档会撤掉它
     *
     * 条带档必然没有封面，进度因此在右栏里；栏高连 101（44 控件 + 4 + 53 进度）
     * 都不够时它也让位，只留那行 44dp 控件。真实上下安全区比判据假定的 48 大很多时
     * 会走到（如 220dp 窗口上下各 48，栏高只有 68）
     *
     * 让位后整页只剩顶栏与那行控件，这是高度地板：可用高 ≥ 顶栏 44 + 底距 12 + 控件 44
     * = 100dp 就装得下，而没有平台会给出更矮的窗口。**这是分析结论、不是代码兜底**——
     * 真掉到 44 以下，条带仍会上下各越界一半（`strip` 是垂直居中的）
     */
    showProgress: boolean;
}

/**
 * 分栏尺寸：入参是**扣掉安全区后**的可用宽高（左右安全区由 Screen 恒缩，上下由页面自加）
 * 封面取「栏高」与「宽度还剩多少」的较小值——前者是常态，后者只在超窄窗口里生效
 *
 * 封面退场时页面会连带撤掉两栏容器的左右外距（见 NowPlayingPanes），右栏因此拿到
 * 「可用宽 − 栏内左右内距」的全部，与翻页版同一条内容线；此处的宽度账按这个口径算
 */
export function playerPanesMetricsFor(
    availableWidth: number,
    availableHeight: number,
): PlayerPanesMetrics {
    const columnHeight = Math.max(
        0,
        availableHeight - PLAYER_COMPACT_NAV_HEIGHT - PLAYER_COMPACT_BOTTOM,
    );
    /*
     * 封面由栏高定，但栏高要先让出封面**下方**那条进度（进度归左栏，横跨整个左栏）
     * 与它们之间的间距，再留一点不贴栏顶的边距 —— 合计 73dp
     */
    const byHeight =
        columnHeight -
        PLAYER_PROGRESS_HEIGHT -
        PANES_COVER_PROGRESS_GAP -
        PANES_COVER_MARGIN;
    const byWidth =
        availableWidth -
        2 * layout.screenGutter -
        PLAYER_PANES_COLUMN_GAP -
        PANES_MIN_SIDE_WIDTH;
    const fitted = Math.floor(Math.min(byHeight, byWidth));
    const coverSize = fitted >= PANES_MIN_COVER ? fitted : 0;
    /*
     * 左栏内距只从**余量**里拿：余量 = 可用宽 − 页面左右内距 − 封面 − 栏距 − 右栏下限，
     * 两侧对半分，再夹到想要的上限。没封面就没有左栏，自然是 0
     *
     * 这么排的意义是「加内距不会把封面挤掉」：封面的尺寸预算完全不含这段内距，
     * 故可用宽 476…523 那段刚够并排的窗口照旧画得出贴下限的封面。它们通常也拿不到内距
     * ——但那是因为封面在那里被**宽度**封顶、余量为 0，不是因为窗口宽落在这一段
     * （500 × 260 就有 6dp 内距）
     */
    /*
     * 不需要再夹一道 `Math.max(0, …)`：余量 = byWidth − coverSize，而
     * `coverSize = floor(min(byHeight, byWidth)) ≤ byWidth`，故余量恒 ≥ 0。
     * 留个不可达的下夹子只会让人以为它在防什么（变异测试证明改它不会让任何断言变红）
     */
    const leadPadding =
        coverSize > 0
            ? Math.min(
                  PANES_LEAD_PADDING_MAX,
                  Math.floor(
                      (availableWidth -
                          2 * layout.screenGutter -
                          coverSize -
                          PLAYER_PANES_COLUMN_GAP -
                          PANES_MIN_SIDE_WIDTH) /
                          2,
                  ),
              )
            : 0;

    /*
     * 门槛按「进度在哪一栏」取：有封面 → 进度在左栏，右栏只排标题 / 歌词 / 控件；
     * 无封面 → 左栏不出现，进度回到右栏底部，门槛各自再加 65dp
     *
     * 这不会造成往复：栏高升高只可能让封面从无变有，而那一刻门槛是**降低**的，
     * 故 sideForm 只会往好的方向走（宽度轴同理：变宽 → 封面出现 → 门槛降）
     *
     * 推论：**条带档 ⟺ 栏高 < 170**，与宽度无关（170 = 无封面那套的 brief 门槛）。
     * 因为封面要栏高 ≥ 193 > 105 = 有封面那套的 brief 门槛，故有封面必不是条带档；
     * 反过来栏高 < 170 时必无封面（193 都够不上），门槛就是 170
     *
     * 标题合成一行之前这两个数恰好都是 193、区间首尾相接；现在中间空出 170…192 那 23dp，
     * 那一段是「够 brief 但还画不出封面」——无封面的 brief
     */
    const hasCover = coverSize > 0;
    const fullMin = hasCover ? SIDE_FULL_WITH_COVER : SIDE_FULL_NO_COVER;
    const briefMin = hasCover ? SIDE_BRIEF_WITH_COVER : SIDE_BRIEF_NO_COVER;
    const sideForm: PlayerSideForm =
        columnHeight >= fullMin
            ? 'full'
            : columnHeight >= briefMin
            ? 'brief'
            : 'strip';
    /*
     * 右栏栏内宽 —— 只有 `showIdentity` 用它，而那只在**条带档**才有意义（另两档标题独占
     * 一行、不与控件争宽）。条带档必无封面（它要栏高 < 170，而封面要栏高 ≥ 193，两区间
     * 不相交，扫扫里那条「条带档却画了封面」的断言守着这一点），故左栏此时整个不出现，
     * 栏内宽就是「可用宽 − 栏内左右内距」，不必再分「有没有封面」两支
     *
     * 曾经写过有封面那一支（扣掉左栏宽与栏距），但它对唯一的消费者不可达 —— 留一个
     * 测不到的分支比删掉更糟：变异测试证明改它不会让任何断言变红
     */
    const sideInnerWidth = availableWidth - 2 * layout.screenGutter;
    return {
        columnHeight,
        coverSize,
        leadPadding,
        sideForm,
        showIdentity:
            sideForm !== 'strip' ||
            sideInnerWidth >= SIDE_STRIP_IDENTITY_MIN_WIDTH,
        showProgress: sideForm !== 'strip' || columnHeight >= SIDE_STRIP_BLOCK,
    };
}
