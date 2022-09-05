import React, {useState} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import rpx from '@/utils/rpx';
import MusicQueue from '@/common/musicQueue';
import Image from '@/components/base/image';
import {ImgAsset} from '@/constants/assetsConst';
import FastImage from 'react-native-fast-image';
import AlbumCover from './albumCover';
import Lyric from './lyric';
import {State, TapGestureHandler} from 'react-native-gesture-handler';

interface IContentProps {}
export default function Content(props: IContentProps) {
  const [tab, selectTab] = useState<'album' | 'lyric'>('album');

  const onPress = (evt: any) => {
    if (evt.nativeEvent.state === State.ACTIVE) {
      if (tab === 'album') {
        selectTab('lyric');
      } else {
        selectTab('album');
      }
    }
  };

  return (
    <TapGestureHandler
      onGestureEvent={() => {
        console.log('WTF');
      }}
      onHandlerStateChange={onPress}>
      <View style={style.wrapper}>
        {tab === 'album' ? <AlbumCover></AlbumCover> : <Lyric></Lyric>}
      </View>
    </TapGestureHandler>
  );
}

const style = StyleSheet.create({
  wrapper: {
    width: rpx(750),
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
