import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import rpx from '@/utils/rpx';
import MusicQueue from '@/core/musicQueue';
import Image from '@/components/base/image';
import {ImgAsset} from '@/constants/assetsConst';
import FastImage from '@/components/base/fastImage';

interface IAlbumCoverProps {}
export default function AlbumCover(props: IAlbumCoverProps) {
  const musicItem = MusicQueue.useCurrentMusicItem();
  return (
    // todo: 封装一层
    <FastImage
      style={style.artwork}
      uri={musicItem?.artwork}
      emptySrc={ImgAsset.albumDefault}></FastImage>
  );
}

const style = StyleSheet.create({
  artwork: {
    width: rpx(500),
    height: rpx(500),
  },
});
