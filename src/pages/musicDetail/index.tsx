import MusicQueue from '@/core/musicQueue';
import MusicBar from '@/components/musicBar';
import StatusBar from '@/components/base/statusBar';
import rpx from '@/utils/rpx';
import {useAtom} from 'jotai';
import React, {useEffect} from 'react';
import {Button, StyleSheet, Text, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import Background from './components/background';
import Bottom from './components/bottom';
import Content from './components/content';
import NavBar from './components/navBar';

export default function MusicDetail() {
  return (
    <>
      <Background></Background>
      <SafeAreaView style={style.wrapper}>
        <StatusBar backgroundColor={'transparent'}></StatusBar>
        <View style={style.container}>
          <NavBar></NavBar>
          <Content></Content>
          <Bottom></Bottom>
        </View>
      </SafeAreaView>
    </>
  );
}

const style = StyleSheet.create({
  wrapper: {
    width: rpx(750),
    flex: 1,
  },
  container: {
    flex: 1,
  },
});
