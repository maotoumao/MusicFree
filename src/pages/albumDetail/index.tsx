import React, {useEffect, useState} from 'react';
import {ScrollView, StyleSheet, Text, ToastAndroid, View} from 'react-native';
import rpx from '@/utils/rpx';
import {useRoute} from '@react-navigation/native';
import NavBar from './components/navBar';
import Header from './components/header';
import MusicBar from '@/components/musicBar';
import MusicList from './components/musicList';
import getStatusBarHeight from '@/utils/getStatusBarHeight';
import useAlbumMusicList from './hooks/useAlbumMusicList';

interface IAlbumDetailProps {}
export default function AlbumDetail(props: IAlbumDetailProps) {
  const route = useRoute<any>();
  const albumItem = route.params?.albumItem ?? null;
  const musicList = useAlbumMusicList(albumItem);

  useEffect(() => {}, []);

  return (
    <View style={style.wrapper}>
      <NavBar></NavBar>
      <MusicList albumItem={albumItem} musicList={musicList}></MusicList>
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
