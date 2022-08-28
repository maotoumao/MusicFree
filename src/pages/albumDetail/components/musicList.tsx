import React from 'react';
import {FlatList, StyleSheet, View} from 'react-native';
import rpx from '@/utils/rpx';
import MusicQueue from '@/common/musicQueue';

import Loading from '@/components/loading';
import usePanel from '@/components/panels/usePanelShow';
import Header from './header';
import ListItem from '@/components/listItem';
import IconButton from '@/components/iconButton';

interface IMusicListProps {
  albumItem: IAlbum.IAlbumItem | null;
  musicList: IMusic.IMusicItem[] | null;
}
export default function MusicList(props: IMusicListProps) {
  const {albumItem, musicList} = props;
  const {showPanel} = usePanel();

  return (
    <View style={style.wrapper}>
      {!musicList ? (
        <Loading></Loading>
      ) : (
        <FlatList
          data={musicList ?? []}
          ListHeaderComponent={
            <Header albumItem={albumItem} musicList={musicList}></Header>
          }
          keyExtractor={_ => `${_.id}${_.platform}`}
          renderItem={({index, item: musicItem}) => (
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
      )}
    </View>
  );
}

const style = StyleSheet.create({
  wrapper: {
    width: rpx(750),
    flex: 1,
  },
  topBtn: {
    width: rpx(750),
    height: rpx(80),
  },
});
