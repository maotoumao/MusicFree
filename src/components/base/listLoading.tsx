import React from 'react';
import {StyleSheet, View} from 'react-native';
import rpx from '@/utils/rpx';
import { ActivityIndicator, useTheme } from 'react-native-paper';
import { fontSizeConst, fontWeightConst } from '@/constants/uiConst';
import ThemeText from './themeText';


interface ILoadingProps {}
export default function ListLoading(props: ILoadingProps) {
  const {colors} = useTheme();

  return (
    <View style={style.wrapper}>
      <ActivityIndicator animating color={colors.text} size={fontSizeConst.title}></ActivityIndicator>
    </View>
  );
}

const style = StyleSheet.create({
  wrapper: {
    width: '100%',
    height: rpx(100),
    justifyContent: 'center',
    alignItems: 'center',
  },
});
