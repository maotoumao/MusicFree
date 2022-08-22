import MusicQueue from '@/common/musicQueue';
import MusicBar from '@/components/musicBar';
import getStatusBarHeight from '@/utils/getStatusBarHeight';
import rpx from '@/utils/rpx';
import {useAtom} from 'jotai';
import React, {useEffect} from 'react';
import {Button, StyleSheet, Text, View} from 'react-native';
import Background from './components/background';
import Bottom from './components/bottom';
import Content from './components/content';
import NavBar from './components/navBar';

export default function MusicDetail() {

  return (
    <View style={style.wrapper}>
      <Background></Background>
      <View style={style.container}>
        <NavBar></NavBar>
        <Content></Content>
        <Bottom></Bottom>
      </View>
    </View>
  );
}

const style = StyleSheet.create({
  wrapper: {
    width: rpx(750),
    flex: 1,
    backgroundColor: '#333333'
  },
  container: {
    paddingTop: getStatusBarHeight(),
    flex: 1,
  },
});
