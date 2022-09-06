import React from 'react';
import {StyleSheet, View} from 'react-native';
import rpx from '@/utils/rpx';
import { ActivityIndicator, useTheme } from 'react-native-paper';
import { fontWeightConst } from '@/constants/uiConst';
import ThemeText from './themeText';


export default function Empty() {
  return (
    <View style={style.wrapper}>
      <ThemeText fontSize='title' >什么都没有呀~</ThemeText>
    </View>
  );
}

const style = StyleSheet.create({
  wrapper: {
    width: '100%',
    flex: 1,
    minHeight: rpx(300),
    justifyContent: 'center',
    alignItems: 'center',
  },
});
