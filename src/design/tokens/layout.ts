import { space } from './space';

/** 无障碍最小命中目标（dp）：IconButton 壳尺寸 + Button hitSlop 补偿基准 */
const hitTarget = 44;

/**
 * App 级布局尺寸（高度 appBar / tabBar / 迷你播放条… + 若干语义宽度）
 * 高度值依赖导航层，待骨架导航 / 轮 3 播放条落地后填；先占位避免硬编码散落到各组件
 */
export const layout = {
    /** toast 横向封顶宽（dp）：小屏走屏宽、横屏/平板封顶 */
    toastMaxWidth: 480,
    /** dialog 卡片封顶宽（dp）：小屏走屏宽-边距、横屏/平板封顶 */
    dialogMaxWidth: 360,
    /** 横屏 panel 右侧全高时的固定宽（dp） */
    panelSideWidth: 420,
    /** 交互控件（Button/Input）标称高度三档（dp）：落地作 minHeight 地板；md 即 hitTarget，无需 hitSlop 补偿 */
    controlHeight: {
        sm: 36,
        md: hitTarget,
        lg: 48,
    },
    /** chip pill 高度（dp）：确定的地板高度，不足 hitTarget 的部分由 Chip 的 hitSlop 补齐 */
    chipHeight: 34,
    /** 无障碍最小命中目标（dp）：IconButton 壳尺寸 + Button hitSlop 补偿基准 */
    hitTarget,
    /** 页面内容线（dp）：文字 / 封面 / 输入 / 卡片等实心内容到屏幕边的距离（= gutter.compact） */
    screenGutter: space.lg,
    /**
     * 内容线按尺寸类分两档（dp）：手机 16、平板（竖 / 横）32
     * 由 hooks/useContentColumn 与 AppBar 消费；页面不直接读 tablet 档
     */
    gutter: {
        compact: space.lg,
        tablet: space['2xl'],
    },
    /**
     * 手机横屏沿用的旧封顶宽（dp）：适配第一步已上线「宽 > 640 的单列列表收窄居中」，
     * 手机横屏（如 915 × 412）今天就是这个行为，轮 13 不改手机、故保留；首页也在用（首页由独立专项负责）。
     * 平板不用它——平板走下方 reading / list 两档
     */
    listContentMaxWidth: 640,
    /** 阅读列封顶宽（dp）：正文 / 表单 / 设置行——散文的舒适行宽，宽了眼睛来回扫 */
    readingMaxWidth: 680,
    /** 媒体行列表封顶宽（dp）：44dp 封面 + 两行短文本不是散文，可以比阅读列宽，宽了才有地方放副标题与标记 */
    listMaxWidth: 840,
    /** 平板竖屏底部面板封顶宽（dp）：居中、顶部圆角；手机满幅、横屏走 panelSideWidth */
    panelMaxWidth: 560,
    /** 横屏分栏：左侧目录栏（设置分区目录）宽（dp） */
    navPaneWidth: 280,
    /** 横屏分栏：详情侧栏（集合详情头部 / 插件详情）宽（dp） */
    detailPaneWidth: 400,
    /** 横屏分栏：搜索来源目录宽（dp），见 docs/design/search-tablet.md */
    sourceDirectoryWidth: 288,
    /** 横屏正在播放页左栏（封面 + 控件）宽（dp）；窄折叠屏按可用宽收窄 */
    playerLeadWidth: 520,
    /** 竖屏平板正在播放页内容列封顶宽（dp）：封面不再撑满 800 */
    playerContentMaxWidth: 560,
    /**
     * 单行列表行的最小视觉高度（dp）：只作用于单行内容（两行行由内容撑出、约 62dp）
     * 触达下限仍是 hitTarget
     */
    listRowMinHeight: 56,
    /** 密集单行列表行的最小视觉高度（dp）：队列这类只有单行文本、需要一屏看更多的场景 */
    listRowDenseMinHeight: 48,
    /** AppBar 内容行高度（dp，不含顶部安全区，由 AppBar 自吸 insets.top） */
    appBarHeight: 56,
    /**
     * 矮窗（手机横屏）下的 AppBar 内容行高度（dp）
     *
     * 56 里的上下呼吸留白是按竖屏 780dp 高定的；横屏只有 360dp 时这 12dp 值 1/5 个列表行。
     * 收到 48 仍高于行内最高的子元素——图标按钮 44，命中区不变；
     * 标题不传 lineHeight、走原生字体度量（Android 中文标题实测 25dp —— CJK 字体行距约 1.45×，
     * 拉丁字体只有 1.2× 上下、约 21dp，拿英文标题去量复现不出这个数），两者都恒低于 44，
     * 故约束只有命中区这一条。由 appBarLayout.appBarHeightFor 统一取值
     */
    appBarCompactHeight: 48,
    /** 媒体行封面缩略图边长（dp）：MediaRow 方 / 圆封面 */
    mediaThumbnail: 44,
    // tabBarHeight: 56,
    /**
     * 迷你播放条（MusicBar）内容高度（dp，不含底部安全区）
     *
     * 只有 MusicBar 自己消费：它是常规流内元素、自带 paddingBottom: insets.bottom，
     * 没有页面按这个数去垫底距（原注释说「页面底部 inset = 该值 + 安全区」，与现实不符，故订正）
     */
    miniPlayerHeight: 64,
    /**
     * 矮窗（手机横屏）下的迷你播放条内容高度（dp）
     *
     * 同 appBarCompactHeight 的道理：行内最高的是 44 的图标按钮与 40 的封面，
     * 52 两者都放得下且命中区不变。整条仍远高于 hitTarget，拖拽切歌的手势面不受影响
     */
    miniPlayerCompactHeight: 52,
} as const;
