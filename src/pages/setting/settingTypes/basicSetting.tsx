import React from 'react';
import {StyleSheet, View} from 'react-native';
import rpx from '@/utils/rpx';
import {useConfig} from '@/common/localConfigManager';
import DownloadManager from '@/common/downloadManager';
import {Text} from 'react-native-paper';

interface IBasicSettingProps {}
export default function BasicSetting(props: IBasicSettingProps) {
  const d = [
    '允许移动网络播放',
    '允许移动网络下载',
    '允许与其他应用同时播放',
    '播放中自动跳过加载失败的歌曲',
    '最大同时下载数目 1 / 3 / 5',
    '清空缓存(图片缓存+其他缓存)',
    '缓存容量上限(100MB, 200MB, 1GB, 2GB)'
  ]
  const options = [{
    
  }]
  return (
    <View style={style.wrapper}>
      {d?.map(_ => (
        <Text>{_}</Text>
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
