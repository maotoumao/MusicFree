import { View, type ViewProps, type FlexStyle } from 'react-native';

import { useColors, space, radius, type Colors } from '@/design';

interface BoxProps extends ViewProps {
    flex?: number;
    /** 横向排列（默认列） */
    row?: boolean;
    align?: FlexStyle['alignItems'];
    justify?: FlexStyle['justifyContent'];
    /** 子项间距 token */
    gap?: keyof typeof space;
    /** 四向内边距 token */
    padding?: keyof typeof space;
    /** 横向内边距 token */
    px?: keyof typeof space;
    /** 纵向内边距 token */
    py?: keyof typeof space;
    /** 背景语义颜色 token */
    bg?: keyof Colors;
    /** 圆角 token */
    radius?: keyof typeof radius;
}

/** 布局原子：View + 高频 token 简写；宽高/边距等任意值经 style 透传 */
export function Box({
    flex,
    row,
    align,
    justify,
    gap,
    padding,
    px,
    py,
    bg,
    radius: radiusKey,
    style,
    ...rest
}: BoxProps) {
    const colors = useColors();
    const tokenStyle = {
        flex,
        flexDirection: row ? ('row' as const) : undefined,
        alignItems: align,
        justifyContent: justify,
        gap: gap != null ? space[gap] : undefined,
        padding: padding != null ? space[padding] : undefined,
        paddingHorizontal: px != null ? space[px] : undefined,
        paddingVertical: py != null ? space[py] : undefined,
        backgroundColor: bg != null ? colors[bg] : undefined,
        borderRadius: radiusKey != null ? radius[radiusKey] : undefined,
    };
    return <View {...rest} style={[tokenStyle, style]} />;
}
