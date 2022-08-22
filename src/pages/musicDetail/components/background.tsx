import React from 'react';
import {Image, StyleSheet, Text, View} from 'react-native';
import rpx from '@/utils/rpx';
import MusicQueue from '@/common/musicQueue';

interface IBackgroundProps {}
export default function Background(props: IBackgroundProps) {
  const musicItem = MusicQueue.useCurrentMusicItem();
  return (
    <>
      {musicItem?.artwork && (
        <Image
          style={style.blur}
          blurRadius={15}
          source={{
            uri: musicItem.artwork,
          }}></Image>
      )}
    </>
  );
}

const style = StyleSheet.create({
  blur: {
    width: '100%',
    height: '100%',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0.6,
  },
});
