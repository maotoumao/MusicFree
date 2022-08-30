import React, {Fragment, useEffect, useState} from 'react';
import {Pressable, StyleSheet, Text, ToastAndroid, View} from 'react-native';
import rpx from '@/utils/rpx';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import useTextColor from '@/hooks/useTextColor';
import MusicQueue from '@/common/musicQueue';
import {Avatar, IconButton, Portal, useTheme} from 'react-native-paper';
import {CircularProgressBase} from 'react-native-circular-progress-indicator';
import {useNavigation} from '@react-navigation/native';
import {ROUTE_PATH} from '@/entry/router';

import musicIsPaused from '@/utils/musicIsPaused';
import usePanel from '../panels/usePanelShow';
import Color from 'color';
import ThemeText from '../base/themeText';
import {ImgAsset} from '@/constants/assetsConst';

interface IProps {}
export default function (props: IProps) {
  // const currentMusicState = useAtomValue(loadableCurrentMusicStateAtom);
  const musicItem = MusicQueue.useCurrentMusicItem();
  const musicState = MusicQueue.usePlaybackState();
  const {showPanel} = usePanel();
  const navigation = useNavigation<any>();
  const progress = MusicQueue.useProgress();
  const {colors} = useTheme();

  return (
    <Fragment>
      {musicItem && (
        <Pressable
          style={[
            style.wrapper,
            {backgroundColor: Color(colors.primary).alpha(0.66).toString()},
          ]}
          onPress={() => {
            navigation.navigate(ROUTE_PATH.MUSIC_DETAIL);
          }}>
          <View style={style.artworkWrapper}>
            <Avatar.Image
              size={rpx(96)}
              source={
                musicItem.artwork
                  ? {
                      uri: musicItem.artwork,
                    }
                  : ImgAsset.albumDefault
              }></Avatar.Image>
          </View>
          <Text
            ellipsizeMode="tail"
            style={style.textWrapper}
            numberOfLines={1}>
            <ThemeText fontSize="content">{musicItem.title}</ThemeText>
            {musicItem?.artist && (
              <ThemeText fontSize="description" fontColor="secondary">
                {' '}
                -{musicItem.artist}
              </ThemeText>
            )}
          </Text>
          <View style={style.actionGroup}>
            <CircularProgressBase
              activeStrokeWidth={rpx(4)}
              inActiveStrokeWidth={rpx(2)}
              inActiveStrokeOpacity={0.2}
              value={
                progress?.duration
                  ? (100 * progress.position) / progress.duration
                  : 0
              }
              duration={100}
              radius={rpx(36)}
              activeStrokeColor={colors.text}
              inActiveStrokeColor={Color(colors.text).alpha(0.5).toString()}>
              {musicIsPaused(musicState) ? (
                <IconButton
                  icon="play"
                  size={rpx(48)}
                  onPress={async () => {
                    await MusicQueue.play();
                  }}
                />
              ) : (
                <IconButton
                  icon="pause"
                  size={rpx(48)}
                  onPress={async () => {
                    await MusicQueue.pause();
                  }}
                />
              )}
            </CircularProgressBase>

            <Icon
              name="playlist-music"
              size={rpx(56)}
              onPress={() => {
                showPanel('PlayList');
              }}
              style={[style.actionIcon, {color: colors.text}]}></Icon>
          </View>
        </Pressable>
      )}
    </Fragment>
  );
}

const style = StyleSheet.create({
  wrapper: {
    width: rpx(750),
    height: rpx(120),
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: rpx(24),
  },
  artworkWrapper: {
    height: rpx(120),
    width: rpx(120),
  },
  textWrapper: {
    flexGrow: 1,
    maxWidth: rpx(382),
  },
  actionGroup: {
    width: rpx(200),
    justifyContent: 'flex-end',
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionIcon: {
    marginLeft: rpx(36),
  },
});
