import React from "react";
import { Text, TextProps } from "react-native";
import { fontSizeConst, fontWeightConst } from "@/constants/uiConst";
import useColors, { CustomizedColors } from "@/hooks/useColors";

type IThemeTextProps = TextProps & {
    color?: string;
    fontColor?: keyof CustomizedColors;
    fontSize?: keyof typeof fontSizeConst;
    fontWeight?: keyof typeof fontWeightConst;
    opacity?: number;
};

export default function ThemeText(props: IThemeTextProps) {
    const colors = useColors();
    const {
        style,
        color,
        children,
        fontSize = "content",
        fontColor = "text",
        fontWeight = "regular",
        opacity,
    } = props;

    const themeStyle = {
        color: color ?? colors[fontColor],
        fontSize: fontSizeConst[fontSize],
        fontWeight: fontWeightConst[fontWeight],
        includeFontPadding: false,
        opacity,
    };

    const _style = Array.isArray(style)
        ? [themeStyle, ...style]
        : [themeStyle, style];

    return (
        <Text {...props} style={_style} allowFontScaling={false}>
            {children}
        </Text>
    );
}
