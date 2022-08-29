import React, {Fragment, useEffect, useRef} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetFlatList,
} from '@gorhom/bottom-sheet';
import rpx from '@/utils/rpx';
import MusicQueue from '@/common/musicQueue';
import {Button, Chip, Divider, useTheme} from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

import repeatModeConst from '@/constants/repeatModeConst';
import Tag from '@/components/tag';
import {_usePanel} from '../usePanelShow';
import {fontSizeConst} from '@/constants/uiConst';
import ThemeText from '@/components/themeText';
import IconButton from '@/components/iconButton';
import isSameMusicItem from '@/utils/isSameMusicItem';
import {internalKey} from '@/constants/commonConst';
import { BottomSheetMethods } from '@gorhom/bottom-sheet/lib/typescript/types';

interface IPlayListProps {}

export default function PlayList(props: IPlayListProps) {
  const musicQueue = MusicQueue.useMusicQueue();
  const currentMusicItem = MusicQueue.useCurrentMusicItem();
  const repeatMode = MusicQueue.useRepeatMode();
  const sheetRef = useRef<BottomSheetMethods | null>();
  const {unmountPanel} = _usePanel(sheetRef);
  const {colors} = useTheme();


  return (
    <BottomSheet
      ref={_ => sheetRef.current = _}
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
      index={0}
      snapPoints={['60%']}
      enablePanDownToClose
      enableOverDrag={false}
      onClose={unmountPanel}>
      <View style={style.wrapper}>
        <ThemeText style={style.headerText} fontSize="title" fontWeight="bold">
          播放列表
          <ThemeText fontColor="secondary"> ({musicQueue.length}首)</ThemeText>
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
        style={style.playList}
        data={musicQueue}
        keyExtractor={_ => _[internalKey]?.globalKey ?? `${_.id}-${_.platform}`}
        renderItem={_ => (
          <Pressable
            onPress={() => {
              MusicQueue.play(_.item);
            }}
            style={style.musicItem}>
            {isSameMusicItem(currentMusicItem, _.item) && (
              <Icon
                name="music"
                color={colors.textHighlight}
                size={fontSizeConst.content}
                style={style.currentPlaying}></Icon>
            )}
            <ThemeText
              style={[
                style.musicItemTitle,
                {
                  color: isSameMusicItem(currentMusicItem, _.item)
                    ? colors.textHighlight
                    : colors.text,
                },
              ]}
              ellipsizeMode="tail"
              numberOfLines={1}>
              {_.item.title}
              <Text style={{fontSize: fontSizeConst.description}}>
                {' '}
                - {_.item.artist}
              </Text>
            </ThemeText>
            <Tag tagName={_.item.platform}></Tag>
            <IconButton
              style={{marginLeft: rpx(14)}}
              name="close"
              size="small"
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
    flex: 1,
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
    flex: 1,
  },
});
