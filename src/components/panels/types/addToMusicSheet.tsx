import React from 'react';
import {StyleSheet, View} from 'react-native';
import rpx from '@/utils/rpx';
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetFlatList,
} from '@gorhom/bottom-sheet';
import Toast from 'react-native-toast-message';
import {_usePanel} from '../usePanelShow';
import ThemeText from '@/components/themeText';
import {useTheme} from 'react-native-paper';
import ListItem from '@/components/listItem';
import MusicSheet from '@/common/musicSheetManager';
import { ImgAsset } from '@/constants/assetsConst';

interface IAddToMusicSheetProps {
  musicItem: IMusic.IMusicItem | IMusic.IMusicItem[];
}

export default function AddToMusicSheet(props: IAddToMusicSheetProps) {
  const sheets = MusicSheet.useSheets();
  const {show, closePanel} = _usePanel();
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
        <ThemeText fontSize='title' fontWeight='semibold'>添加到歌单</ThemeText>
      </View>
      <BottomSheetFlatList
        data={sheets ?? []}
        keyExtractor={sheet => sheet.id}
        renderItem={({item: sheet}) => (
          <ListItem
            key={`${sheet.id}`}
            title={sheet.title}
            left={{
              artwork:sheet.coverImg,
              fallback: ImgAsset.albumDefault
            }}
            onPress={async () => {
              try {
                await MusicSheet.addMusic(sheet.id, musicItem);
                closePanel();
                Toast.show({
                  text1: '添加到歌单成功',
                  position: 'bottom',
                });
              } catch {
                Toast.show({
                  type: 'error',
                  text1: '添加到歌单失败',
                  position: 'bottom',
                });
              }
            }}
            desc={`${sheet.musicList.length ?? '-'}首`}></ListItem>
        )}></BottomSheetFlatList>
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
    marginBottom: rpx(36),
  },
  scrollWrapper: {
    paddingHorizontal: rpx(24),
    paddingTop: rpx(24),
  },
});
