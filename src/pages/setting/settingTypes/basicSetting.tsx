import React from 'react';
import {StyleSheet, View} from 'react-native';
import rpx from '@/utils/rpx';
import {useConfig} from '@/common/localConfigManager';

interface IBasicSettingProps {}
export default function BasicSetting(props: IBasicSettingProps) {
  const config = useConfig();
  return <View style={style.wrapper}></View>;
}

const style = StyleSheet.create({
  wrapper: {
    width: rpx(750),
    padding: rpx(24),
  },
});
