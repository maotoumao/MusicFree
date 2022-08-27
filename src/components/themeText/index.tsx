import React from 'react';
import {StyleSheet, Text, TextProps} from 'react-native';
import rpx from '@/utils/rpx';
import Color from 'color';
import useTextColor from '@/hooks/useTextColor';
import {useTheme} from 'react-native-paper';
import {fontSizeConst, fontWeightConst} from '@/constants/uiConst';

type ColorKey = 'primary' | 'normal' | 'secondary' | 'highlight';

type IThemeTextProps = TextProps & {
  fontColor?: ColorKey;
  fontSize?: keyof typeof fontSizeConst;
  fontWeight?: keyof typeof fontWeightConst;
};

const colorMap: Record<ColorKey, keyof ReactNativePaper.ThemeColors> = {
  primary: 'textPrimary',
  normal: 'text',
  secondary: 'textSecondary',
  highlight: 'textHighlight',
} as const;

export default function ThemeText(props: IThemeTextProps) {
  const theme = useTheme();
  const {style, children, fontSize = 'content', fontColor = 'normal', fontWeight='regular'} = props;

  const themeStyle = {
    color: theme.colors[colorMap[fontColor]],
    fontSize: fontSizeConst[fontSize],
    fontWeight: fontWeightConst[fontWeight]
  };

  const _style = Array.isArray(style)
    ? [themeStyle, ...style]
    : [themeStyle, style];

  return (
    <Text {...props} style={_style}>
      {children}
    </Text>
  );
}

const style = StyleSheet.create({
  wrapper: {
    width: rpx(750),
  },
});
