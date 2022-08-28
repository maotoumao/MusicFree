import React from 'react';
import {Image, StyleSheet, View} from 'react-native';
import rpx from '@/utils/rpx';
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetFlatList,
} from '@gorhom/bottom-sheet';
import {Divider} from 'react-native-paper';
import MusicQueue from '@/common/musicQueue';
import MusicSheet from '@/common/musicSheet';
import {_usePanel} from '../usePanelShow';
import ListItem from '@/components/listItem';
import ThemeText from '@/components/themeText';
import usePrimaryColor from '@/hooks/usePrimaryColor';

interface IMusicItemOptionsProps {
  /** 歌曲信息 */
  musicItem: IMusic.IMusicItem;
  /** 歌曲所在歌单 */
  musicSheet?: IMusic.IMusicSheetItem;
}
export default function MusicItemOptions(props: IMusicItemOptionsProps) {
  const {show, closePanel, showPanel} = _usePanel();
  const primaryColor = usePrimaryColor();

  const {musicItem, musicSheet} = props ?? {};

  const options = [
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
      icon: 'trash-can-outline',
      title: '删除',
      show: !!musicSheet,
      onPress: async () => {
        await MusicSheet.removeMusic(musicSheet!.id, musicItem);
        closePanel();
      },
    },
  ];

  return (
    <BottomSheet
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
      index={show}
      snapPoints={['60%']}
      enablePanDownToClose
      enableOverDrag={false}
      onClose={closePanel}>
      <View style={style.header}>
        <Image
          style={style.artwork}
          source={{
            uri: musicItem?.artwork,
          }}></Image>
        <View style={style.content}>
          <ThemeText numberOfLines={2} style={style.title}>
            {musicItem?.title}
          </ThemeText>
          <ThemeText fontColor="secondary" fontSize='description'>
            {musicItem?.artist} - {musicItem?.album}
          </ThemeText>
        </View>
      </View>
      <Divider></Divider>
      <BottomSheetFlatList
        data={options}
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
                width: rpx(48)
              }}
              itemPaddingHorizontal={0}
              itemHeight={rpx(96)}
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
