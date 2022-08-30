import React from 'react';
import {FlatList, StyleSheet, Text, View} from 'react-native';
import rpx from '@/utils/rpx';
import DownloadManager from '@/common/downloadManager';
import ListItem from '@/components/base/listItem';

interface IDownloadingListProps {}
export default function DownloadingList(props: IDownloadingListProps) {
  const downloading = DownloadManager.useDownloadingMusic();
  const pending = DownloadManager.usePendingMusic();
  const progress = DownloadManager.useDownloadingProgress();
  return (
    <View style={style.wrapper}>
      <FlatList
        data={downloading}
        keyExtractor={_ => `dl${_.filename}`}
        renderItem={({item}) => (
          <ListItem
            title={item.musicItem.title}
            desc={`${progress[item.filename]?.progress ?? 0} / ${
              progress[item.filename]?.size
            }`}></ListItem>
        )}></FlatList>
      <FlatList
        data={pending}
        keyExtractor={_ => `pd${_.filename}`}
        renderItem={({item}) => (
          <ListItem title={item.musicItem.title} desc="等待下载"></ListItem>
        )}></FlatList>
    </View>
  );
}

const style = StyleSheet.create({
  wrapper: {
    width: rpx(750),
    flex: 1,
  },
});
