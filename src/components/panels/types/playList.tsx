import React, {Fragment, useEffect, useRef} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetFlatList,
  BottomSheetFlatListMethods,
} from '@gorhom/bottom-sheet';
import rpx from '@/utils/rpx';
import MusicQueue from '@/common/musicQueue';
import {Button, Chip, Divider, IconButton, useTheme} from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

import repeatModeConst from '@/constants/repeatModeConst';
import Tag from '@/components/tag';
import {_usePanelShow} from '../usePanelShow';
import {fontSizeConst, fontWeightConst} from '@/constants/uiConst';
import ThemeText from '@/components/themeText';

interface IPlayListProps {}

export default function PlayList(props: IPlayListProps) {
  const musicQueue = MusicQueue.useMusicQueue();
  const currentMusicItem = MusicQueue.useCurrentMusicItem();
  const repeatMode = MusicQueue.useRepeatMode();
  const {show, closePanel} = _usePanelShow();
  const {colors} = useTheme();
  // const listRef = useRef<BottomSheetFlatListMethods | null>();

  useEffect(() => {
    return () => {
      closePanel();
    };
  }, []);

  // useEffect(() => {
  //   if(MusicQueue.currentIndex > -1) {
  //     console.log(MusicQueue.currentIndex);
  //     listRef.current?.scrollToIndex({
  //       animated: false,
  //       index: MusicQueue.currentIndex
  //     })
  //   }
  // }, [musicQueue])

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
      backgroundStyle={{backgroundColor: colors.primary}}
      handleComponent={null}
      index={show}
      snapPoints={['60%']}
      enablePanDownToClose
      enableOverDrag={false}
      onClose={closePanel}>
      <View style={style.wrapper}>
        <ThemeText style={style.headerText}>
          播放列表
          <ThemeText type="secondary" style={style.headerDescText}>
            {' '}
            ({musicQueue.length}首)
          </ThemeText>
        </ThemeText>
        <Button
          color={colors.text}
          onPress={() => {
            MusicQueue.toggleRepeatMode();
          }}
          icon={repeatModeConst[repeatMode].icon}>
          {repeatModeConst[repeatMode].text}
        </Button>
        {/* <IconButton
          icon="trash-can-outline"
          size={rpx(36)}
          onPress={() => {
            console.log('二次确认');
          }}></IconButton> */}
      </View>
      <Divider></Divider>
      <BottomSheetFlatList
        // ref={ref => (listRef.current = ref)}
        style={style.playList}
        data={musicQueue}
        keyExtractor={_ =>
          _._internalData?.globalKey ?? `${_.id}-${_.platform}`
        }
        renderItem={_ => (
          <Pressable
            onPress={() => {
              MusicQueue.play(_.item);
            }}
            style={style.musicItem}>
            {currentMusicItem?.id === _.item.id &&
              currentMusicItem.platform === _.item.platform && (
                <Icon
                  name="music"
                  color={colors.text}
                  size={fontSizeConst.normal}
                  style={style.currentPlaying}></Icon>
              )}
            <ThemeText
              style={style.musicItemTitle}
              ellipsizeMode="tail"
              numberOfLines={1}>
              {_.item.title}
              <Text style={style.musicItemDesc}> - {_.item.artist}</Text>
            </ThemeText>
            <Tag tagName={_.item.platform}></Tag>
            <IconButton
              icon="close"
              size={rpx(28)}
              onPress={() => {
                MusicQueue.remove(_.item);
              }}></IconButton>
          </Pressable>
        )}></BottomSheetFlatList>
    </BottomSheet>
  );
}

const style = StyleSheet.create({
  wrapper: {
    width: rpx(750),
    paddingHorizontal: rpx(24),
    marginTop: rpx(24),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerText: {
    fontSize: fontSizeConst.big,
    fontWeight: fontWeightConst.bolder,
    flex: 1,
  },
  headerDescText: {
    fontSize: fontSizeConst.normal,
  },
  playList: {
    paddingHorizontal: rpx(24),
  },
  currentPlaying: {
    marginRight: rpx(6),
  },
  musicItem: {
    height: rpx(120),
    flexDirection: 'row',
    alignItems: 'center',
  },
  musicItemTitle: {
    fontSize: fontSizeConst.normal,
    flex: 1,
  },
  musicItemDesc: {
    fontSize: fontSizeConst.smaller,
  },
});
