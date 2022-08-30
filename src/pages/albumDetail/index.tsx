import React, {useEffect} from 'react';
import {StyleSheet, View} from 'react-native';
import rpx from '@/utils/rpx';
import {useRoute} from '@react-navigation/native';
import NavBar from './components/navBar';
import MusicBar from '@/components/musicBar';
import AlbumMusicList from './components/albumMusicList';
import useAlbumMusicList from './hooks/useAlbumMusicList';
import StatusBar from '@/components/base/statusBar';
import { SafeAreaView } from 'react-native-safe-area-context';

interface IAlbumDetailProps {}
export default function AlbumDetail(props: IAlbumDetailProps) {
  const route = useRoute<any>();
  const albumItem = route.params?.albumItem ?? null;
  const musicList = useAlbumMusicList(albumItem);


  return (
    <SafeAreaView style={style.wrapper}>
      <StatusBar></StatusBar>
      <NavBar></NavBar>
      <AlbumMusicList albumItem={albumItem} musicList={musicList}></AlbumMusicList>
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
