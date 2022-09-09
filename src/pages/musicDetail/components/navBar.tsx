import React, {useEffect} from 'react';
import {AppState, StyleSheet, Text, View} from 'react-native';
import rpx from '@/utils/rpx';
import {IconButton} from 'react-native-paper';
import MusicQueue from '@/core/musicQueue';
import {useNavigation} from '@react-navigation/native';
import Tag from '@/components/base/tag';
import {fontSizeConst, fontWeightConst} from '@/constants/uiConst';
import useShare from '@/components/share/useShare';

interface INavBarProps {}
export default function NavBar(props: INavBarProps) {
  const navigation = useNavigation();
  const musicItem = MusicQueue.useCurrentMusicItem();
  const {showShare} = useShare();

  return (
    <View style={style.wrapper}>
      <IconButton
        icon="arrow-left"
        size={rpx(48)}
        color="white"
        onPress={() => {
          navigation.goBack();
        }}></IconButton>
      <View style={style.headerContent}>
        <Text numberOfLines={1} style={style.headerTitleText}>
          {musicItem?.title ?? ''}
        </Text>
        <View style={style.headerDesc}>
          <Text style={style.headerArtistText}>{musicItem?.artist}</Text>
          <Tag tagName={musicItem?.platform ?? ''}></Tag>
        </View>
      </View>
      <IconButton
        icon="share"
        color="white"
        size={rpx(48)}
        onPress={() => {
          showShare({
            content: {
              type: 'ShareMusic',
              track: {
                id: musicItem?.id,
                platform: musicItem?.platform
              },
            },
            title: musicItem?.title,
            desc: musicItem?.artist,
          });
        }}></IconButton>
    </View>
  );
}

const style = StyleSheet.create({
  wrapper: {
    width: rpx(750),
    height: rpx(150),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerContent: {
    flex: 1,
    height: rpx(150),
    justifyContent: 'center',
    alignItems: 'center',
    maxWidth: rpx(640),
  },
  headerTitleText: {
    color: 'white',
    fontWeight: fontWeightConst.semibold,
    fontSize: fontSizeConst.title,
    marginBottom: rpx(12),
    includeFontPadding: false,
  },
  headerDesc: {
    height: rpx(32),
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerArtistText: {
    color: 'white',
    fontSize: fontSizeConst.subTitle,
    includeFontPadding: false,
  },
});
