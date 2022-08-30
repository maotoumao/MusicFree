import React from 'react';
import {FlatListProps, StyleSheet, Text} from 'react-native';
import rpx from '@/utils/rpx';
import {useRoute} from '@react-navigation/native';
import MusicSheet from '@/common/musicSheetManager';
import MusicQueue from '@/common/musicQueue';
import usePanel from '@/components/panels/usePanel';
import {FlatList} from 'react-native-gesture-handler';

import ListItem from '@/components/base/listItem';
import IconButton from '@/components/base/iconButton';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import DownloadManager from '@/common/downloadManager';

interface IMusicListProps {
  /** 顶部 */
  Header?: FlatListProps<IMusic.IMusicItem>['ListHeaderComponent'];
  /** 音乐列表 */
  musicList?: IMusic.IMusicItem[];
  /** 所在歌单 */
  musicSheet?: IMusic.IMusicSheetItem;
  /** 是否展示序号 */
  showIndex?: boolean;
  /** 点击 */
  onItemPress?: (musicItem: IMusic.IMusicItem) => void;
}
export default function MusicList(props: IMusicListProps) {
  const {Header, musicList, musicSheet, showIndex, onItemPress} = props;
  const {showPanel} = usePanel();

  return (
    <FlatList
      style={style.wrapper}
      ListHeaderComponent={Header}
      data={musicList ?? []}
      keyExtractor={musicItem => `ml-${musicItem.id}${musicItem.platform}`}
      renderItem={({index, item: musicItem}) => {
        return (
          <ListItem
            left={showIndex ? {index: index + 1, width: rpx(56)} : undefined}
            title={musicItem.title}
            desc={
              <>
                {DownloadManager.isDownloaded(musicItem) && (
                  <Icon
                    color="#11659a"
                    name="check-circle"
                    size={rpx(22)}></Icon>
                )}
                <Text>
                  {musicItem.artist} - {musicItem.album}
                </Text>
              </>
            }
            tag={musicItem.platform}
            onPress={() => {
              if (onItemPress) {
                onItemPress(musicItem);
              } else {
                MusicQueue.playWithReplaceQueue(musicItem, musicList ?? []);
              }
            }}
            right={() => (
              <IconButton
                name="dots-vertical"
                size="normal"
                fontColor="normal"
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
});
