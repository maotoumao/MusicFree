import React from 'react';
import {FlatList, StyleSheet, Text, View} from 'react-native';
import rpx from '@/utils/rpx';
import {SafeAreaView} from 'react-native-safe-area-context';
import SimpleAppBar from '@/components/base/simpleAppBar';
import StatusBar from '@/components/base/statusBar';
import DownloadingList from './downloadingList';
import MusicBar from '@/components/musicBar';

interface IDownloadingProps {}
export default function Downloading(props: IDownloadingProps) {
  return (
    <SafeAreaView style={style.wrapper}>
      <StatusBar></StatusBar>
      <SimpleAppBar title="正在下载"></SimpleAppBar>
      <DownloadingList></DownloadingList>
      <MusicBar></MusicBar>
    </SafeAreaView>
  );
}

const style = StyleSheet.create({
  wrapper: {
    width: rpx(750),
    flex: 1,
  },
});
