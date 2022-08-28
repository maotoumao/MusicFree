import React from 'react';
import {StyleSheet, View} from 'react-native';
import rpx from '@/utils/rpx';
import {useConfig} from '@/common/localConfigManager';
import DownloadManager from '@/common/downloadManager';
import {Text} from 'react-native-paper';

interface IBasicSettingProps {}
export default function BasicSetting(props: IBasicSettingProps) {
  const config = useConfig();
  const d = DownloadManager.useDownloadedMusic();
  return (
    <View style={style.wrapper}>
      {d?.map(_ => (
        <Text>{_.title}</Text>
      ))}
    </View>
  );
}

const style = StyleSheet.create({
  wrapper: {
    width: rpx(750),
    padding: rpx(24),
  },
});
