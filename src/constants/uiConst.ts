import { CustomizedColors } from "@/hooks/useColors";
import rpx from "@/utils/rpx";

const fontSizeConst = {
    /** 标签 */
    tag: rpx(20),
    /** 描述文本等字体 */
    description: rpx(22),
    /** 副标题 */
    subTitle: rpx(26),
    /** 正文字体 */
    content: rpx(28),
    /** 标题字体 */
    title: rpx(32),
    /** appbar的字体 */
    appbar: rpx(36),
};

const fontWeightConst = {
    regular: "400",
    medium: "500",
    semibold: "600",
    bold: "700",
    bolder: "800",
} as const;

const iconSizeConst = {
    small: rpx(30),
    light: rpx(36),
    normal: rpx(42),
    big: rpx(60),
    large: rpx(72),
};

type ColorKey = "normal" | "secondary" | "highlight" | "primary";
const colorMap: Record<ColorKey, keyof CustomizedColors> = {
    normal: "text",
    secondary: "textSecondary",
    highlight: "textHighlight",
    primary: "primary",
} as const;

export { fontSizeConst, fontWeightConst, iconSizeConst, colorMap };
export type { ColorKey };
