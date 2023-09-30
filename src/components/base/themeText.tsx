import React from 'react';
import {Text, TextProps} from 'react-native';
import {
    ColorKey,
    colorMap,
    fontSizeConst,
    fontWeightConst,
} from '@/constants/uiConst';
import useColors from '@/hooks/useColors';

type IThemeTextProps = TextProps & {
    color?: string;
    fontColor?: ColorKey;
    fontSize?: keyof typeof fontSizeConst;
    fontWeight?: keyof typeof fontWeightConst;
};

export default function ThemeText(props: IThemeTextProps) {
    const colors = useColors();
    const {
        style,
        color,
        children,
        fontSize = 'content',
        fontColor = 'normal',
        fontWeight = 'regular',
    } = props;

    const themeStyle = {
        color: color ?? colors[colorMap[fontColor]],
        fontSize: fontSizeConst[fontSize],
        fontWeight: fontWeightConst[fontWeight],
        includeFontPadding: false,
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
