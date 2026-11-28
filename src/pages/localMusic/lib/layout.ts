/**
 * 本地音乐库的版式判据（纯函数：吃窗口宽高 + 左右安全区之和）
 *
 * 为什么不走 `useLayoutClass`：手机横屏 915 × 412 的最小边是 412，判成 `phone`，
 * 而那正是浪费最明显的场景（内容限宽 640、两侧各 137.5dp 空白）。播放详情页的
 * `NowPlayingPanes` 已经立了这个先例——**结构分叉按窗口 dp 算，不按尺寸类**，
 * 尺寸类只管「限宽多少 / 内容线多宽」这类连续量
 *
 * 判据两问，都是单调的：
 * 1. 够不够横 —— 按**窗口**宽高（宽 ≥ 高）。朝向就是朝向，与安全区无关
 * 2. 三栏各自的下限装不装得下 —— 按**可用宽**（窗口宽 − 左右安全区之和）
 */
import { layout } from '@/design';

/** 分栏形态：stack = 顶部 Tab + 单列（竖屏与窄窗口，与适配前一致）；panes = 左栏 + 集合 + 歌曲 */
export type LibraryForm = 'stack' | 'panes';

/** 左栏两档：icon = 图标 + 小字（88dp，手机横屏）；labelled = 图标 + 标签（复用 navPaneWidth） */
export type LibraryRailForm = 'icon' | 'labelled';

/** 图标档左栏宽（dp）：44dp 命中宽 + 两侧各 22 的呼吸，恰好放得下一行两字标签 */
export const LIBRARY_RAIL_ICON_WIDTH = 88;

/**
 * 集合列（文件夹 / 专辑 / 艺术家）的下限（dp）
 * 一行是 44dp 封面 + 12 间距 + 两行短文本，再窄标题就只剩两三个字
 */
const COLLECTION_COLUMN_MIN = 280;

/** 歌曲栏的下限（dp）：序号 + 标题 + 时长，且头部要放得下 64dp 封面与「播放全部」 */
const MUSIC_COLUMN_MIN = 320;

/**
 * 进 panes 所需的最小**可用宽**（dp）= 图标栏 + 集合列下限 + 歌曲栏下限，没有任何余量假定
 *
 * 口径是「窗口宽 − 左右安全区之和」，而不是窗口宽本身。改造前这里按「单侧 48dp」猜、
 * 共留 96dp，理由是「判据必须是窗口 dp 的纯函数，否则同一台设备旋转到同一尺寸会因
 * 刘海朝向给出不同结构」。那个顾虑只对 `insets.left` / `insets.right` **各自**成立，
 * 用**两者之和**则不受朝向影响——理由是**镜像对称**：横屏两个朝向互为镜像，任何物理
 * 遮挡物到各自屏幕边的距离都不变，只是落到哪个逻辑边翻转了，故 inset 的多重集不变、
 * 和必然不变。（别把理由写成「刘海换边时导航栏也跟着换」：手势导航横屏根本不产生
 * 左右 inset，平板的导航栏也留在底部，那条推理在这两种配置下不成立。）
 *
 * 能保证的只有这一句：**同一窗口尺寸 + 同一安全区之和 → 同一结构**。安全区真的变了
 * （切换导航模式、进出分屏）就按新的实际空间重判——那是想要的行为，不是抖动。
 * 两个已知的不完美，都不值得为它们加滞回（加了就是把刚修掉的 bug 请回来）：
 * - `useWindowDimensions` 与 `useSafeAreaInsets` 是两条独立更新路径，旋转瞬间可能出现
 *   「新窗口宽 + 旧 inset」的中间帧，极窄门槛附近会多一次三栏树的挂载/卸载；
 *   而旋转本来就重挂整页，代价可忽略
 * - 横屏左右分屏时每半窗口只报与自己相交的 inset，故两半同宽而和不同；但半窗口只有
 *   360–640dp，远在 688 门槛之下，撞不上
 *
 * 而猜出来的 96dp 代价是实打实的：
 *
 * 780 × 360 的手机横屏（2340 × 1080 @3.0，实测应用区域 2218 × 1080）可用宽 739，
 * 三栏净需求 688、还余 51dp，却因为门槛是 784 被整个挡在 stack 之外——横过来还是竖屏版式。
 *
 * 列宽（libraryCollectionWidthFor）同口径：`Screen` 左右恒缩，故容器实宽本就是可用宽，
 * 原来拿窗口宽算再减 96 只是让集合列偏窄；两处统一后不再有这层错配
 */
export const LIBRARY_PANES_MIN_AVAILABLE_WIDTH =
    LIBRARY_RAIL_ICON_WIDTH + COLLECTION_COLUMN_MIN + MUSIC_COLUMN_MIN;

/** 集合列占**可用宽**的比例：它是选择器，内容该多分 */
const COLLECTION_WIDTH_RATIO = 0.4;

/** 集合列的上限（dp）：窗口再宽也不让选择器无限长大 */
const COLLECTION_COLUMN_MAX = COLLECTION_COLUMN_MIN + 180;

/**
 * 左栏升到标签档的最小**可用宽**（dp）= 标签栏 280 + 集合列上限 460 + 歌曲栏下限 320
 *
 * 它只是「这么宽才配得上把 280dp 花在左栏」的预算线，不是一个耦合条件：集合列宽的
 * 公式不含 rail 项，所以升档那一刻集合列**自动**不回缩（只有歌曲栏让出左栏多占的
 * 192dp）。改造前那道「留够歌曲栏」的夹子让集合列依赖 rail，才需要靠门槛位置去保证
 * 不回缩；夹子随门槛一起去掉后，这层保证成了恒真
 *
 * 注意门槛处集合列走的是**比例**（1060 × 0.4 = 424），并未顶到上限 460 ——
 * 上限只是这条预算里给集合列留的余量上界，不是升档时的实际宽度
 */
const LABELLED_RAIL_MIN_AVAILABLE_WIDTH =
    layout.navPaneWidth + COLLECTION_COLUMN_MAX + MUSIC_COLUMN_MIN;

/**
 * 该用哪种版式
 *
 * 两问：
 * 1. 够不够横 —— 用**窗口**宽高比，朝向就是朝向，与安全区无关。竖屏（含平板竖屏）
 *    高度充裕，顶部 Tab 那 44dp 不值得搬，而把集合与歌曲并排会让两边都变窄。
 *    等号给横向正方形窗口——那种窗口宽度同样有余
 * 2. 三栏装不装得下 —— 用**可用宽**（窗口宽 − 左右安全区之和），见
 *    LIBRARY_PANES_MIN_AVAILABLE_WIDTH 的说明
 *
 * `horizontalInset` 传 `insets.left + insets.right`；只吃和、不吃各自，故朝向翻转不改结构
 */
export function libraryFormFor(
    width: number,
    height: number,
    horizontalInset: number,
): LibraryForm {
    if (width < height) {
        return 'stack';
    }
    return width - horizontalInset >= LIBRARY_PANES_MIN_AVAILABLE_WIDTH
        ? 'panes'
        : 'stack';
}

/** panes 形态下左栏取哪一档（吃可用宽） */
export function libraryRailFormFor(usableWidth: number): LibraryRailForm {
    return usableWidth >= LABELLED_RAIL_MIN_AVAILABLE_WIDTH
        ? 'labelled'
        : 'icon';
}

/** panes 形态下左栏的宽度（dp） */
export function libraryRailWidthFor(form: LibraryRailForm): number {
    return form === 'labelled' ? layout.navPaneWidth : LIBRARY_RAIL_ICON_WIDTH;
}

/**
 * 集合列的宽度（dp）；入参是**可用宽**，与判据同口径
 *
 * 不给 flex：集合列是「选择器」，歌曲栏才是内容，宽度该优先给内容。
 * 取可用宽的 40%，再夹进 [下限, 上限]。
 *
 * 这里**不再**额外夹一道「必须给歌曲栏留够下限」。它不是「碰巧不可达」，而是
 * **与两个门槛的定义冗余**——这么说才说清哪几个常量不能单独动：
 *
 * - 图标档：门槛 ≡ `RAIL + CMIN + MMIN`。集合列贴下限时 `music = a − RAIL − CMIN ≥ MMIN`
 *   由门槛定义即真；集合列走比例只可能在 `a > CMIN / 0.4 = 700`，那时
 *   `music = 0.6a − RAIL − round 的半个 dp ≥ MMIN` 只需 `a ≳ 680`，而这一段已 > 700 ✓
 * - 标签档：门槛 ≡ `NAV + CMAX + MMIN`，而集合列 ≤ CMAX，故
 *   `music ≥ a − NAV − CMAX ≥ MMIN` 同样由定义即真 ✓
 *
 * 故**不能**只改 `COLLECTION_COLUMN_MIN` / `MUSIC_COLUMN_MIN` / `COLLECTION_WIDTH_RATIO`
 * 之一而不同时看门槛。单测那条全宽扫描会先红（实测 CMIN 280→300 红 7 条、
 * MMIN 320→340 红 6 条、比例 0.4→0.6 红 2 条）
 *
 * 最紧的一点在 `a = 688`：`688 − 88 − 280 = 320` **恰好相等**，靠等号不可达，不是靠
 * 某个几 dp 的缓冲。（老口径下这道夹子是活的：门槛 784 含 96dp 假定时条件变成 `a < 840`，
 * 784…839 之间确实需要它兜住歌曲栏。）
 */
export function libraryCollectionWidthFor(usableWidth: number): number {
    return Math.round(
        Math.min(
            Math.max(
                usableWidth * COLLECTION_WIDTH_RATIO,
                COLLECTION_COLUMN_MIN,
            ),
            COLLECTION_COLUMN_MAX,
        ),
    );
}

/** 分栏所需的全部尺寸；`rail*` / `collectionWidth` / `musicWidth` 只在 panes 下有意义 */
export interface LibraryLayout {
    form: LibraryForm;
    /** 窗口宽 − 左右安全区之和：panes 下三栏容器的实宽（`Screen` 左右恒缩） */
    usableWidth: number;
    railForm: LibraryRailForm;
    railWidth: number;
    collectionWidth: number;
    /** 歌曲栏拿剩下的。它在渲染里是 flex 区，此值供判据自身与单测对账 */
    musicWidth: number;
}

/**
 * 一次算出分栏的全部尺寸，调用方不再各自推导口径
 *
 * 「判据与列宽必须同口径（都吃可用宽）」这个不变量原本活在组件里：两个调用点各自写一遍
 * `insets.left + insets.right`，而一旦把 `libraryCollectionWidthFor(usableWidth)` 误写成
 * `(width)`，**没有任何测试会红**，后果却是真的——窗口 780 / 安全区共 92（可用 688）时
 * 集合列会按 780 算成 312，歌曲栏只剩 `688 − 88 − 312 = 288 < 320`。那正是这次要修的
 * 那类错配的镜像。聚合之后口径只有一处可选，这类错在结构上不可能发生，也顺带消掉了
 * 两个文件里重复的 inset 加法
 */
export function libraryLayoutFor(
    width: number,
    height: number,
    horizontalInset: number,
): LibraryLayout {
    const usableWidth = width - horizontalInset;
    const railForm = libraryRailFormFor(usableWidth);
    const railWidth = libraryRailWidthFor(railForm);
    const collectionWidth = libraryCollectionWidthFor(usableWidth);
    return {
        form: libraryFormFor(width, height, horizontalInset),
        usableWidth,
        railForm,
        railWidth,
        collectionWidth,
        musicWidth: usableWidth - railWidth - collectionWidth,
    };
}
