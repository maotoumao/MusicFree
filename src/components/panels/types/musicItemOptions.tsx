import React, {useRef} from 'react';
import {StyleSheet, View} from 'react-native';
import rpx from '@/utils/rpx';
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetFlatList,
} from '@gorhom/bottom-sheet';
import {Divider} from 'react-native-paper';
import MusicQueue from '@/core/musicQueue';
import MusicSheet from '@/core/musicSheetManager';
import {_usePanel} from '../usePanel';
import ListItem from '@/components/base/listItem';
import ThemeText from '@/components/base/themeText';
import usePrimaryColor from '@/hooks/usePrimaryColor';
import DownloadManager from '@/core/downloadManager';
import Image from '@/components/base/image';
import {ImgAsset} from '@/constants/assetsConst';
import {BottomSheetMethods} from '@gorhom/bottom-sheet/lib/typescript/types';
import Clipboard from '@react-native-clipboard/clipboard';
import FastImage from 'react-native-fast-image';
import MediaMetaManager from '@/core/mediaMetaManager';

interface IMusicItemOptionsProps {
  /** 歌曲信息 */
  musicItem: IMusic.IMusicItem;
  /** 歌曲所在歌单 */
  musicSheet?: IMusic.IMusicSheetItem;
}

const ITEM_HEIGHT = rpx(96);
export default function MusicItemOptions(props: IMusicItemOptionsProps) {
  const sheetRef = useRef<BottomSheetMethods | null>();
  const {showPanel, unmountPanel} = _usePanel(sheetRef);
  const primaryColor = usePrimaryColor();

  const {musicItem, musicSheet} = props ?? {};

  const downloaded = DownloadManager.isDownloaded(musicItem);
  function closePanel() {
    sheetRef.current?.close();
  }
  // 关联歌词
  const associatedLrc = MediaMetaManager.getMediaMeta(musicItem)?.associatedLrc;
  // todo: padding bottom
  const options = [
    {
      icon: 'id-card',
      title: `ID: ${musicItem.platform}@${musicItem.id}`,
      onPress: () => {
        Clipboard.setString(
          JSON.stringify({
            platform: musicItem.platform,
            id: musicItem.id,
          }, null, ''),
        );
      },
    },
    {
      icon: 'account-music-outline',
      title: `作者: ${musicItem.artist}`,
      onPress: () => {
        Clipboard.setString(musicItem.artist);
      },
    },
    {
      icon: 'album',
      title: `专辑: ${musicItem.album}`,
      onPress: () => {
        Clipboard.setString(musicItem.album);
      },
    },
    {
      icon: 'motion-play-outline',
      title: '下一首播放',
      onPress: () => {
        MusicQueue.addNext(musicItem);
        closePanel();
      },
    },
    {
      icon: 'plus-box-multiple-outline',
      title: '添加到歌单',
      onPress: () => {
        showPanel('AddToMusicSheet', {musicItem});
      },
    },
    {
      icon: 'download-circle-outline',
      title: '下载',
      show: !downloaded,
      onPress: async () => {
        await DownloadManager.downloadMusic(musicItem);
        closePanel();
      },
    },
    {
      icon: 'check-circle-outline',
      title: '已下载',
      show: downloaded,
    },
    {
      icon: 'trash-can-outline',
      title: '删除',
      show: !!musicSheet,
      onPress: async () => {
        await MusicSheet.removeMusic(musicSheet!.id, musicItem);
        closePanel();
      },
    },
    {
      icon: 'delete-forever-outline',
      title: '删除本地下载',
      show: downloaded,
      onPress: async () => {
        await DownloadManager.removeDownloaded(musicItem);
        closePanel();
      },
    },
    {
      icon: 'link-variant',
      title: associatedLrc
        ? `已关联歌词 ${associatedLrc.platform}@${associatedLrc.id}`
        : '关联歌词',
      onPress: async () => {
        showPanel('AssociateLrc', {
          musicItem
        })
      },
    },
    {
      icon: 'link-variant-remove',
      title: '取消关联歌词',
      show: !!associatedLrc,
      onPress: () => {
        MediaMetaManager.updateMediaMeta(musicItem, {
          associatedLrc: undefined,
        });
        closePanel();
      },
    },
  ];

  return (
    <BottomSheet
      ref={_ => (sheetRef.current = _)}
      backdropComponent={props => {
        return (
          <BottomSheetBackdrop
            disappearsOnIndex={-1}
            pressBehavior={'close'}
            opacity={0.5}
            {...props}></BottomSheetBackdrop>
        );
      }}
      backgroundStyle={{backgroundColor: primaryColor}}
      handleComponent={null}
      index={0}
      snapPoints={['60%']}
      enablePanDownToClose
      enableOverDrag={false}
      onClose={unmountPanel}>
      <View style={style.header}>
        <FastImage
          style={style.artwork}
          source={{
            uri: musicItem?.artwork,
          }}
          defaultSource={ImgAsset.albumDefault}></FastImage>
        <View style={style.content}>
          <ThemeText numberOfLines={2} style={style.title}>
            {musicItem?.title}
          </ThemeText>
          <ThemeText fontColor="secondary" fontSize="description">
            {musicItem?.artist} - {musicItem?.album}
          </ThemeText>
        </View>
      </View>
      <Divider></Divider>
      <BottomSheetFlatList
        data={options}
        getItemLayout={(_, index) => ({
          length: ITEM_HEIGHT,
          offset: ITEM_HEIGHT * index,
          index,
        })}
        style={style.listWrapper}
        keyExtractor={_ => _.title}
        renderItem={({item}) =>
          item.show !== false ? (
            <ListItem
              left={{
                icon: {
                  name: item.icon,
                  size: 'small',
                  fontColor: 'normal',
                },
                width: rpx(48),
              }}
              itemPaddingHorizontal={0}
              itemHeight={ITEM_HEIGHT}
              title={item.title}
              onPress={item.onPress}></ListItem>
          ) : (
            <></>
          )
        }></BottomSheetFlatList>
    </BottomSheet>
  );
}

const style = StyleSheet.create({
  wrapper: {
    width: rpx(750),
    flex: 1,
  },
  header: {
    width: rpx(750),
    height: rpx(200),
    flexDirection: 'row',
    padding: rpx(24),
  },
  listWrapper: {
    paddingHorizontal: rpx(24),
    paddingTop: rpx(12),
  },
  artwork: {
    width: rpx(140),
    height: rpx(140),
    borderRadius: rpx(16),
  },
  content: {
    marginLeft: rpx(36),
    width: rpx(526),
    height: rpx(140),
    justifyContent: 'space-around',
  },
  title: {
    paddingRight: rpx(24),
  },
});
