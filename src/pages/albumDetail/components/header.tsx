import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import rpx from '@/utils/rpx';
import LinearGradient from 'react-native-linear-gradient';
import {Divider, IconButton, useTheme} from 'react-native-paper';
import MusicQueue from '@/core/musicQueue';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import usePanel from '@/components/panels/usePanel';
import {
  fontSizeConst,
  fontWeightConst,
  iconSizeConst,
} from '@/constants/uiConst';
import Color from 'color';
import ThemeText from '@/components/base/themeText';
import Image from '@/components/base/image';
import {ImgAsset} from '@/constants/assetsConst';
import useDialog from '@/components/dialogs/useDialog';
import DownloadManager from '@/core/downloadManager';
import FastImage from 'react-native-fast-image';

interface IHeaderProps {
  albumItem: IAlbum.IAlbumItem | null;
  musicList: IMusic.IMusicItem[] | null;
}
export default function Header(props: IHeaderProps) {
  const {albumItem, musicList} = props;
  const {showPanel} = usePanel();
  const {showDialog} = useDialog();
  const {colors} = useTheme();

  return (
    <>
      <LinearGradient
        colors={[
          Color(colors.primary).alpha(0.8).toString(),
          Color(colors.primary).alpha(0.15).toString(),
        ]}
        style={style.wrapper}>
        <View style={style.content}>
          <FastImage
            style={style.coverImg}
            source={{
              uri: albumItem?.artwork,
            }}
            defaultSource={ImgAsset.albumDefault}></FastImage>
          <View style={style.details}>
            <ThemeText>{albumItem?.title}</ThemeText>
            <ThemeText fontColor="secondary" fontSize="description">
              共{musicList ? musicList.length ?? 0 : '-'}首{' '}
              {albumItem?.date ?? ''}
            </ThemeText>
          </View>
        </View>
        <Divider style={style.divider}></Divider>
        <View style={style.albumDesc}>
          <ThemeText fontColor="secondary" fontSize="description">
            专辑信息: {albumItem?.description ?? ''}
          </ThemeText>
        </View>
      </LinearGradient>
      <View
        style={[
          style.topWrapper,
          {backgroundColor: Color(colors.primary).alpha(0.15).toString()},
        ]}>
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
            size={iconSizeConst.normal}
            color={colors.text}></Icon>
          <ThemeText fontWeight="bold">播放全部</ThemeText>
        </Pressable>
        <IconButton
          icon={'plus-box-multiple-outline'}
          size={rpx(48)}
          onPress={async () => {
            showPanel('AddToMusicSheet', {
              musicItem: musicList ?? [],
            });
          }}></IconButton>
        <IconButton
          icon="download-circle-outline"
          size={rpx(48)}
          onPress={async () => {
            showDialog('SimpleDialog', {
              title: '下载专辑',
              content: `确定下载${musicList?.length}首歌吗?`,
              onOk() {
                musicList && DownloadManager.downloadMusic(musicList);
              },
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
  details: {
    width: rpx(456),
    height: rpx(140),
    justifyContent: 'space-between',
  },
  divider: {
    marginVertical: rpx(18),
  },

  albumDesc: {
    width: rpx(702),
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
});
