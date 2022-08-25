import React from 'react';
import {Image, Pressable, StyleSheet, Text, View} from 'react-native';
import rpx from '@/utils/rpx';
import LinearGradient from 'react-native-linear-gradient';
import {Divider, IconButton, useTheme} from 'react-native-paper';
import MusicQueue from '@/common/musicQueue';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import usePanelShow from '@/components/panels/usePanelShow';
import {fontSizeConst, fontWeightConst} from '@/constants/uiConst';
import Color from 'color';
import ThemeText from '@/components/themeText';

interface IHeaderProps {
  albumItem: IAlbum.IAlbumItem | null;
  musicList: IMusic.IMusicItem[] | null;
}
export default function Header(props: IHeaderProps) {
  const {albumItem, musicList} = props;
  console.log(albumItem);
  const {showPanel} = usePanelShow();
  const {colors} = useTheme();

  return (
    <>
      <LinearGradient colors={[Color(colors.primary).alpha(0.8).toString(), Color(colors.primary).alpha(0.15).toString()]} style={style.wrapper}>
        <View style={style.content}>
          <Image
            style={style.coverImg}
            source={
              albumItem?.artwork
                ? {
                    uri: albumItem.artwork,
                  }
                : require('@/assets/imgs/album-default.jpg')
            }></Image>
          <View style={style.details}>
            <ThemeText style={style.title}>{albumItem?.title}</ThemeText>
            <ThemeText type='secondary' style={style.desc}>
              共{musicList ? musicList.length ?? 0 : '-'}首{' '}
              {albumItem?.date ?? ''}
            </ThemeText>
          </View>
        </View>
        <Divider></Divider>
        <ThemeText type='secondary' style={style.albumDesc}>
          专辑信息: {albumItem?.description ?? ''}
        </ThemeText>
      </LinearGradient>
      <View style={[style.topWrapper, {backgroundColor: Color(colors.primary).alpha(0.15).toString()}]}>
        <Pressable
          style={style.playAll}
          onPress={() => {
            if (musicList) {
              MusicQueue.playWithReplaceQueue(musicList[0], musicList);
            }
          }}>
          <Icon
            name="play-circle-outline"
            style={style.playAllIcon}
            size={fontSizeConst.normal}
            color={colors.text}></Icon>
          <ThemeText style={style.playAllText}>播放全部</ThemeText>
        </Pressable>
        <IconButton
          icon={'plus-box-multiple-outline'}
          size={rpx(48)}
          onPress={async () => {
            showPanel('AddToMusicSheet', {
              musicItem: musicList ?? [],
            });
          }}></IconButton>
      </View>
    </>
  );
}

const style = StyleSheet.create({
  wrapper: {
    width: rpx(750),
    paddingVertical: rpx(24),
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    width: rpx(702),
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  coverImg: {
    width: rpx(210),
    height: rpx(210),
    borderRadius: rpx(24),
  },
  title: {
    fontSize: fontSizeConst.normal
  },
  details: {
    width: rpx(456),
    height: rpx(140),
    justifyContent: 'space-between',
  },
  desc: {
    fontSize: fontSizeConst.small
  },
  albumDesc: {
    marginTop: rpx(24),
    width: rpx(702),
    fontSize: fontSizeConst.small
  },
  /** playall */
  topWrapper: {
    height: rpx(72),
    paddingHorizontal: rpx(24),
    flexDirection: 'row',
    alignItems: 'center',
  },
  playAll: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  playAllIcon: {
    marginRight: rpx(12),
  },
  playAllText: {
    fontSize: fontSizeConst.normal,
    fontWeight: fontWeightConst.bold,
  },
});
