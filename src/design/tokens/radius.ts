/**
 * 圆角刻度（dp）—— 按角色取档，不按尺寸
 * `full` 形状即语义：Chip / 播放点 / Switch / 圆封面 / 进度条端部 / 搜索 pill
 * `sm` 微元素与正文内嵌内容：Tag / Checkbox / 时间胶囊 / Markdown 图片
 * `md` 标准控件与常规容器：Button / Input / 缩略图 / 入口卡 / 代码块
 * `lg` 需要突出的封面与浮层卡：MediaCard 封面 / Dialog / Toast
 * `xl` 大面浮层：Panel 顶角与侧角
 * `2xl` hero 封面：播放页大封面
 */
export const radius = {
    none: 0,
    sm: 4,
    md: 8,
    lg: 12,
    xl: 16,
    '2xl': 20,
    /** 胶囊 / 圆形 */
    full: 9999,
} as const;
