import React from 'react';
import {FlatList, StyleSheet, Text, View} from 'react-native';
import rpx from '@/utils/rpx';
import DownloadManager from '@/common/downloadManager';
import ListItem from '@/components/listItem';
import MusicQueue from '@/common/musicQueue';
import IconButton from '@/components/iconButton';
import usePanel from '@/components/panels/usePanelShow';

interface IMusicListProps {}
export default function MusicList(props: IMusicListProps) {
  const downloaded = DownloadManager.useDownloadedMusic();
  const {showPanel} = usePanel();
  return (
    <FlatList
        style={style.wrapper}
      data={downloaded ?? []}
      keyExtractor={_ => `localmusic${_.platform}${_.id}`}
      renderItem={({item: musicItem, index}) => (
        <ListItem
          left={{
            index: index + 1,
            width: rpx(64),
          }}
          title={musicItem.title}
          desc={`${musicItem.artist} - ${musicItem.album}`}
          tag={musicItem.platform}
          onPress={() => MusicQueue.play(musicItem)}
          right={() => (
            <IconButton
              name="dots-vertical"
              onPress={() =>
                showPanel('MusicItemOptions', {musicItem})
              }></IconButton>
          )}></ListItem>
      )}></FlatList>
  );
}

const style = StyleSheet.create({
  wrapper: {
    width: rpx(750),
    flex: 1
  },
});
