import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import rpx from '@/utils/rpx';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import MusicSheet from '@/common/musicSheetManager';
import MusicQueue from '@/common/musicQueue';
import isSameMusicItem from '@/utils/isSameMusicItem';
import usePanel from '@/components/panels/usePanelShow';
import RNFS from 'react-native-fs';
import {pluginManager} from '@/common/pluginManager';
import DownloadManager from '@/common/downloadManager';

interface IOpertionsProps {}
export default function Opertions(props: IOpertionsProps) {
  //briefcase-download-outline  briefcase-check-outline checkbox-marked-circle-outline
  const favoriteMusicSheet = MusicSheet.useSheets('favorite');
  const musicItem = MusicQueue.useCurrentMusicItem();
  const isDownloaded = DownloadManager.useIsDownloaded(musicItem);
  const {showPanel} = usePanel();

  const musicIndexInFav =
    favoriteMusicSheet?.musicList.findIndex(_ =>
      isSameMusicItem(_, musicItem),
    ) ?? -1;

  return (
    <View style={style.wrapper}>
      {musicIndexInFav !== -1 ? (
        <Icon
          name="heart"
          size={rpx(48)}
          color="red"
          onPress={() => {
            MusicSheet.removeMusicByIndex('favorite', musicIndexInFav);
          }}></Icon>
      ) : (
        <Icon
          name="heart-outline"
          size={rpx(48)}
          color="white"
          onPress={() => {
            if (musicItem) {
              MusicSheet.addMusic('favorite', musicItem);
            }
          }}></Icon>
      )}
      <Icon
        name={
          isDownloaded ? 'check-circle-outline' : 'download-circle-outline'
        }
        size={rpx(48)}
        color="white"
        onPress={() => {
          if (musicItem && !isDownloaded) {
            DownloadManager.downloadMusic(musicItem);
          }
        }}></Icon>
      <Icon
        name="dots-vertical"
        size={rpx(48)}
        color="white"
        onPress={() => {
          if (musicItem) {
            showPanel('MusicItemOptions', {
              musicItem: musicItem,
            });
          }
        }}></Icon>
    </View>
  );
}

const style = StyleSheet.create({
  wrapper: {
    width: rpx(750),
    height: rpx(80),
    marginBottom: rpx(24),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
});
