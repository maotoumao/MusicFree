import React, {useState} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import rpx from '@/utils/rpx';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import MusicQueue from '@/core/musicQueue';
import repeatModeConst from '@/constants/repeatModeConst';
import musicIsPaused from '@/utils/musicIsPaused';
import usePanel from '@/components/panels/usePanel';

interface IProps {}
export default function (props: IProps) {
  const repeatMode = MusicQueue.useRepeatMode();
  const musicState = MusicQueue.usePlaybackState();
  const {showPanel} = usePanel();

  return (
    <>
      <View style={style.wrapper}>
        <Icon
          color={'white'}
          name={repeatModeConst[repeatMode].icon}
          size={rpx(56)}
          onPress={() => {
            MusicQueue.toggleRepeatMode();
          }}></Icon>
        <Icon
          color={'white'}
          name={'skip-previous'}
          size={rpx(56)}
          onPress={() => {
            MusicQueue.skipToPrevious();
          }}></Icon>
        <Icon
          color={'white'}
          name={
            musicIsPaused(musicState)
              ? 'play-circle-outline'
              : 'pause-circle-outline'
          }
          size={rpx(96)}
          onPress={() => {
            if (musicIsPaused(musicState)) {
              MusicQueue.play();
            } else {
              MusicQueue.pause();
            }
          }}></Icon>
        <Icon
          color={'white'}
          name={'skip-next'}
          size={rpx(56)}
          onPress={() => {
            MusicQueue.skipToNext();
          }}></Icon>
        <Icon
          color={'white'}
          name={'playlist-music'}
          size={rpx(56)}
          onPress={() => {
            showPanel('PlayList');
          }}></Icon>
      </View>
    </>
  );
}

const style = StyleSheet.create({
  wrapper: {
    width: rpx(750),
    marginTop: rpx(36),
    height: rpx(100),
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
});
