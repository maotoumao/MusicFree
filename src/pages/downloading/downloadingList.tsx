import React from 'react';
import {FlatList, StyleSheet, Text, View} from 'react-native';
import rpx from '@/utils/rpx';
import DownloadManager from '@/common/downloadManager';
import ListItem from '@/components/base/listItem';
import {sizeFormatter} from '@/utils/fileUtils';

interface IDownloadingListProps {}
export default function DownloadingList(props: IDownloadingListProps) {
  const downloading = DownloadManager.useDownloadingMusic();
  const pending = DownloadManager.usePendingMusic();
  const progress = DownloadManager.useDownloadingProgress(); // progress没有更新同步

  return (
    <View style={style.wrapper}>
      <FlatList
        style={style.downloading}
        data={downloading.concat(pending)}
        keyExtractor={_ => `dl${_.filename}`}
        extraData={progress}
        renderItem={({item, index}) => {
          if (index < downloading.length) {
            const prog = progress[item.filename];
            return (
              <ListItem
                title={item.musicItem.title}
                desc={`${
                  prog?.progress ? sizeFormatter(prog.progress) : '-'
                } / ${prog?.size ? sizeFormatter(prog.size) : '-'}`}></ListItem>
            );
          } else {
            return (
              <ListItem title={item.musicItem.title} desc="等待下载"></ListItem>
            );
          }
        }}></FlatList>
    </View>
  );
}

const style = StyleSheet.create({
  wrapper: {
    width: rpx(750),
    flex: 1,
  },
  downloading: {
    flexGrow: 0,
  },
});
