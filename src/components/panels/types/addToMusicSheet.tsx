import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import rpx from '@/utils/rpx';
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetScrollView,
} from '@gorhom/bottom-sheet';
import MusicSheet from '@/common/musicSheet';
import Toast from 'react-native-toast-message';
import MusicSheetItem from '@/components/musicSheetListItem';
import { _usePanelShow } from '../usePanelShow';
import { fontSizeConst, fontWeightConst } from '@/constants/uiConst';
import ThemeText from '@/components/themeText';
import Color from 'color';
import { useTheme } from 'react-native-paper';

interface IAddToMusicSheetProps {
  musicItem: IMusic.IMusicItem | IMusic.IMusicItem[]
}

export default function AddToMusicSheet(props: IAddToMusicSheetProps) {
  const sheets = MusicSheet.useSheets();
  const {show, closePanel} = _usePanelShow();
  const {musicItem = []} = props ?? {};
  const {colors} = useTheme();

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
      index={show}
      snapPoints={['60%', '80%']}
      enablePanDownToClose
      enableOverDrag={false}
      onClose={closePanel}>
      <View style={style.header}>
        <ThemeText style={style.headerText}>添加到歌单</ThemeText>
      </View>
      <BottomSheetScrollView style={style.scrollWrapper}>
        {sheets.map(sheet => (
          <MusicSheetItem
            key={`${sheet.id}`}
            title={sheet.title}
            coverImg={sheet.coverImg}
            desc={`${sheet.musicList.length ?? '-'}首`}
            onPress={async () => {
              try {
                await MusicSheet.addMusic(sheet.id, musicItem);
                closePanel();
                Toast.show({
                  text1: '添加到歌单成功',
                  position: 'bottom'
                })
              } catch {
                Toast.show({
                  type: 'error',
                  text1: '添加到歌单失败',
                  position: 'bottom'
                })
              }
            }}></MusicSheetItem>
        ))}
      </BottomSheetScrollView>
    </BottomSheet>
  );
}

const style = StyleSheet.create({
  wrapper: {
    width: rpx(750),
  },
  header: {
    paddingHorizontal: rpx(24),
    marginTop: rpx(24),
  },
  headerText: {
    fontSize: fontSizeConst.normal,
    fontWeight: fontWeightConst.bold,
  },
  scrollWrapper: {
    paddingHorizontal: rpx(24),
    paddingTop: rpx(24),
  },
});
