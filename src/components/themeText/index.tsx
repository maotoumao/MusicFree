import React from 'react';
import {StyleSheet, Text, TextProps} from 'react-native';
import rpx from '@/utils/rpx';;
import Color from 'color';
import useTextColor from '@/hooks/useTextColor';

type IThemeTextProps = TextProps & {
  type?: 'primary' | 'secondary';
};

export default function ThemeText(props: IThemeTextProps) {
  const _textColor = useTextColor();
  const {style, children, type} = props;

  const textColor =
    type === 'secondary'
      ? Color(_textColor).alpha(0.7).toString()
      : _textColor;

  const _style = Array.isArray(style)
    ? [{color: textColor}, ...style]
    : [{color: textColor}, style];

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
