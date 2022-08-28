import React from 'react';
import {StyleSheet} from 'react-native';
import rpx from '@/utils/rpx';
import {useRoute} from '@react-navigation/native';
import MusicSheet from '@/common/musicSheetManager';
import MusicQueue from '@/common/musicQueue';
import usePanel from '@/components/panels/usePanelShow';
import {FlatList} from 'react-native-gesture-handler';
import Header from './header';
import ListItem from '@/components/listItem';
import IconButton from '@/components/iconButton';

interface IMusicListProps {}
export default function MusicList(props: IMusicListProps) {
  const route = useRoute<any>();
  const id = route.params?.id ?? 'favorite';
  const musicSheet = MusicSheet.useSheets(id);
  const {showPanel} = usePanel();

  return (
    <FlatList
      style={style.wrapper}
      ListHeaderComponent={<Header></Header>}
      data={musicSheet?.musicList ?? []}
      keyExtractor={musicItem => `${musicItem.id}${musicItem.platform}`}
      renderItem={({index, item: musicItem}) => {
        return (
          <ListItem
            left={{index: index + 1, width: rpx(56)}}
            title={musicItem.title}
            desc={`${musicItem.artist} - ${musicItem.album}`}
            tag={musicItem.platform}
            onPress={() =>
              MusicQueue.playWithReplaceQueue(musicItem, musicSheet.musicList)
            }
            right={() => (
              <IconButton
                name="dots-vertical"
                size="normal"
                fontColor='normal'
                onPress={() => {
                  showPanel('MusicItemOptions', {musicItem, musicSheet});
                }}></IconButton>
            )}></ListItem>
        );
      }}></FlatList>
  );
}

const style = StyleSheet.create({
  wrapper: {
    width: rpx(750),
  },
  topBtn: {
    width: rpx(750),
    height: rpx(80),
  },
});

// <MusicListItem
// key={`${musicItem.id}${musicItem.platform}`}
// musicItem={musicItem}
// left={props => (
//   <ThemeText fontColor="secondary" {...props} style={style.musicIndex}>
//     {index + 1}
//   </ThemeText>
// )}
// onPress={() => {
//   MusicQueue.playWithReplaceQueue(musicItem, musicSheet.musicList);
// }}
// onRightPress={() => {
//   showPanel('MusicItemOptions', {musicItem, musicSheet});
// }}></MusicListItem>
