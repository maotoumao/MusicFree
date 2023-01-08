import React from 'react';
import {Text, TextProps} from 'react-native';
import {useTheme} from 'react-native-paper';
import {
    ColorKey,
    colorMap,
    fontSizeConst,
    fontWeightConst,
} from '@/constants/uiConst';

type IThemeTextProps = TextProps & {
    fontColor?: ColorKey;
    fontSize?: keyof typeof fontSizeConst;
    fontWeight?: keyof typeof fontWeightConst;
};

export default function ThemeText(props: IThemeTextProps) {
    const theme = useTheme();
    const {
        style,
        children,
        fontSize = 'content',
        fontColor = 'normal',
        fontWeight = 'regular',
    } = props;

    const themeStyle = {
        color: theme.colors[colorMap[fontColor]],
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
