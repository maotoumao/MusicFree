import React from 'react';
import {ImageBackground, StyleSheet, View} from 'react-native';
import rpx from '@/utils/rpx';
import {useRoute} from '@react-navigation/native';
import NavBar from './components/navBar';
import MusicBar from '@/components/musicBar';
import SheetMusicList from './components/sheetMusicList';
import { SafeAreaView } from 'react-native-safe-area-context';
import StatusBar from '@/components/base/statusBar';
interface ISheetDetailProps {}
export default function SheetDetail(props: ISheetDetailProps) {
  const route = useRoute<any>();
  const id = route.params?.id ?? 'favorite';

  return (
    <SafeAreaView style={style.wrapper}>
      <StatusBar></StatusBar>
      <NavBar></NavBar>
      <SheetMusicList></SheetMusicList>
      <MusicBar></MusicBar>
    </SafeAreaView>
  );
}

const style = StyleSheet.create({
  wrapper: {
    width: rpx(750),
    flex: 1,
  },
});
