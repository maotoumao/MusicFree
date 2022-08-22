import React from 'react';
import {Image, StyleSheet, Text, View} from 'react-native';
import rpx from '@/utils/rpx';
import {SvgUri, SvgXml} from 'react-native-svg';
import { ActivityIndicator, useTheme } from 'react-native-paper';
import { fontSizeConst, fontWeightConst } from '@/constants/uiConst';
import ThemeText from '../themeText';


interface ILoadingProps {}
export default function Loading(props: ILoadingProps) {
  const {colors} = useTheme();

  return (
    <View style={style.wrapper}>
      <ActivityIndicator animating color={colors.text}></ActivityIndicator>
      <ThemeText style={style.text}>加载中...</ThemeText>
    </View>
  );
}

const style = StyleSheet.create({
  wrapper: {
    width: '100%',
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  img: {
    width: rpx(200),
    height: rpx(200),
  },
  text: {
    fontWeight: fontWeightConst.bold,
    fontSize: fontSizeConst.big,
    marginTop: rpx(48),
  },
});
