import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import rpx from '@/utils/rpx';
import MusicQueue from '@/common/musicQueue';
import Image from '@/components/image';
import { ImgAsset } from '@/constants/assetsConst';

interface IContentProps {}
export default function Content(props: IContentProps) {
  const musicItem = MusicQueue.useCurrentMusicItem();
  return (
    <View style={style.wrapper}>
      <Image
        style={style.artwork}
        uri={musicItem?.artwork}
        fallback={ImgAsset.albumDefault}></Image>
    </View>
  );
}

const style = StyleSheet.create({
  wrapper: {
    width: rpx(750),
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  artwork: {
    width: rpx(500),
    height: rpx(500),
  },
});
