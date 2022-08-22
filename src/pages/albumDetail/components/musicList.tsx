import React, {useState} from 'react';
import {FlatList, Pressable, StyleSheet, Text, View} from 'react-native';
import rpx from '@/utils/rpx';
import MusicQueue from '@/common/musicQueue';

import MusicListItem from '@/components/musicListItem';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {IconButton} from 'react-native-paper';
import Loading from '@/components/loading';
import usePanelShow from '@/components/panels/usePanelShow';
import Header from './header';
import { fontSizeConst } from '@/constants/uiConst';
import ThemeText from '@/components/themeText';

interface IMusicListProps {
  albumItem: IAlbum.IAlbumItem | null;
  musicList: IMusic.IMusicItem[] | null;
}
export default function MusicList(props: IMusicListProps) {
  const {albumItem, musicList} = props;
  const {showPanel} = usePanelShow();

  return (
    <View style={style.wrapper}>
      {!musicList ? (
        <Loading></Loading>
      ) : (
        <FlatList
          data={musicList ?? []}
          ListHeaderComponent={<Header albumItem={albumItem} musicList={musicList}></Header>}
          renderItem={({index, item: musicItem}) => (
            <MusicListItem
              key={`${musicItem.id}${musicItem.platform}`}
              musicItem={musicItem}
              left={props => (
                <ThemeText type='secondary' {...props} style={style.musicIndex}>
                  {index + 1}
                </ThemeText>
              )}
              onPress={() => {
                MusicQueue.play(musicItem);
              }}
              onRightPress={() => {
                showPanel('MusicItemOptions', {musicItem});
              }}></MusicListItem>
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
  musicIndex: {
    fontSize: fontSizeConst.bigger,
    fontStyle: 'italic',
    width: rpx(64),
    height: '100%',
    textAlignVertical: 'center',
    textAlign: 'center',
  },
});
