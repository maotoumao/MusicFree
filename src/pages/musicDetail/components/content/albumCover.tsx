import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import rpx from '@/utils/rpx';
import MusicQueue from '@/core/musicQueue';
import Image from '@/components/base/image';
import {ImgAsset} from '@/constants/assetsConst';
import FastImage from 'react-native-fast-image';

interface IAlbumCoverProps {}
export default function AlbumCover(props: IAlbumCoverProps) {
  const musicItem = MusicQueue.useCurrentMusicItem();
  return (
    // todo: 封装一层
    <FastImage
      style={style.artwork}
      source={{
        uri: musicItem?.artwork,
      }}
      defaultSource={ImgAsset.albumDefault}></FastImage>
  );
}

const style = StyleSheet.create({
  artwork: {
    width: rpx(500),
    height: rpx(500),
  },
});
