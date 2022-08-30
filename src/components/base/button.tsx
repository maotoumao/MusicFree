import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import rpx from '@/utils/rpx';
import {Button} from 'react-native-paper';
import useColors from '@/hooks/useColors';
import ThemeText from './themeText';

interface IButtonProps {
  children: string;
  onPress?: () => void;
}
export default function (props: IButtonProps) {
  const {children, onPress} = props;
  return (
    <Button {...props} onPress={onPress}>
      <ThemeText>{children}</ThemeText>
    </Button>
  );
}

const style = StyleSheet.create({
  wrapper: {
    width: rpx(750),
  },
});
