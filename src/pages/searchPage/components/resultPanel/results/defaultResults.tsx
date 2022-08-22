import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import rpx from '@/utils/rpx';

interface IDefaultResultsProps {}
export default function DefaultResults(props: IDefaultResultsProps) {
  return (
    <View>
      <Text>敬请期待</Text>
    </View>
  );
}

const style = StyleSheet.create({
  wrapper: {
    width: rpx(750),
  },
});
