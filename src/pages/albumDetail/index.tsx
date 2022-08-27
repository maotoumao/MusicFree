import React, {useEffect} from 'react';
import {StyleSheet, View} from 'react-native';
import rpx from '@/utils/rpx';
import {useRoute} from '@react-navigation/native';
import NavBar from './components/navBar';
import MusicBar from '@/components/musicBar';
import MusicList from './components/musicList';
import useAlbumMusicList from './hooks/useAlbumMusicList';
import StatusBar from '@/components/statusBar';
import { SafeAreaView } from 'react-native-safe-area-context';

interface IAlbumDetailProps {}
export default function AlbumDetail(props: IAlbumDetailProps) {
  const route = useRoute<any>();
  const albumItem = route.params?.albumItem ?? null;
  const musicList = useAlbumMusicList(albumItem);

  useEffect(() => {}, []);

  return (
    <SafeAreaView style={style.wrapper}>
      <StatusBar></StatusBar>
      <NavBar></NavBar>
      <MusicList albumItem={albumItem} musicList={musicList}></MusicList>
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
