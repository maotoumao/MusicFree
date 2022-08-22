import React from 'react';
import {StyleSheet, View} from 'react-native';
import rpx from '@/utils/rpx';
import {useRoute} from '@react-navigation/native';
import NavBar from './components/navBar';
import MusicBar from '@/components/musicBar';
import MusicList from './components/musicList';

interface ISheetDetailProps {}
export default function SheetDetail(props: ISheetDetailProps) {
  const route = useRoute<any>();
  const id = route.params?.id ?? 'favorite';

  return (
    <View style={style.wrapper}>
      <NavBar></NavBar>
      <MusicList></MusicList>
      <MusicBar></MusicBar>
    </View>
  );
}

const style = StyleSheet.create({
  wrapper: {
    width: rpx(750),
    flex: 1,
  },
});
