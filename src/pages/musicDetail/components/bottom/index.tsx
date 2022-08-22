import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import rpx from '@/utils/rpx';
import SeekBar from './seekBar';
import PlayControl from './playControl';
import Opertions from './operations';

interface IBottomProps {}
export default function Bottom(props: IBottomProps) {
  return (
    <View style={style.wrapper}>
      <Opertions></Opertions>
      <SeekBar></SeekBar>
      <PlayControl></PlayControl>
    </View>
  );
}

const style = StyleSheet.create({
  wrapper: {
    width: rpx(750),
    height: rpx(320),
  },
});
