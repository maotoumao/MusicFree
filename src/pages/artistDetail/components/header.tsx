import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import rpx from '@/utils/rpx';

interface IHeaderProps {}
export default function Header(props: IHeaderProps) {
  return <View style={style.wrapper}></View>;
}

const style = StyleSheet.create({
  wrapper: {
    width: rpx(750),
    height: rpx(350),
    backgroundColor: 'red',
  },
});
