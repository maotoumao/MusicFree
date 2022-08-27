import React, {useState} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import rpx from '@/utils/rpx';
import {IconButton, List, Menu} from 'react-native-paper';
import {useRoute} from '@react-navigation/native';
import MusicSheet from '@/common/musicSheet';
import MusicQueue from '@/common/musicQueue';
import MusicListItem from '@/components/musicListItem';
import usePanelShow from '@/components/panels/usePanelShow';
import {FlatList} from 'react-native-gesture-handler';
import Header from './header';
import { fontSizeConst } from '@/constants/uiConst';
import ThemeText from '@/components/themeText';

interface IMusicListProps {}
export default function MusicList(props: IMusicListProps) {
  const route = useRoute<any>();
  const id = route.params?.id ?? 'favorite';
  const musicSheet = MusicSheet.useSheets(id);
  const {showPanel} = usePanelShow();

  return (
    <FlatList
      style={style.wrapper}
      ListHeaderComponent={<Header></Header>}
      data={musicSheet?.musicList ?? []}
      renderItem={({index, item: musicItem}) => {
        return (
          <MusicListItem
            key={`${musicItem.id}${musicItem.platform}`}
            musicItem={musicItem}
            left={props => (
              <ThemeText fontColor="secondary" {...props} style={style.musicIndex}>
                {index + 1}
              </ThemeText>
            )}
            onPress={() => {
              MusicQueue.playWithReplaceQueue(musicItem, musicSheet.musicList);
            }}
            onRightPress={() => {
              showPanel('MusicItemOptions', {musicItem, musicSheet});
            }}></MusicListItem>
        );
      }}></FlatList>
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
