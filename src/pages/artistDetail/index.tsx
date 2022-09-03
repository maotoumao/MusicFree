import React, {useEffect} from 'react';
import {StyleSheet} from 'react-native';
import rpx from '@/utils/rpx';
import {SafeAreaView} from 'react-native-safe-area-context';
import StatusBar from '@/components/base/statusBar';
import MusicBar from '@/components/musicBar';
import SimpleAppBar from '@/components/base/simpleAppBar';
import Header from './components/header';
import Body from './components/body';
import {useSetAtom} from 'jotai';
import {initQueryResult, queryResultAtom} from './store/atoms';

interface IArtistDetailProps {}
export default function ArtistDetail(props: IArtistDetailProps) {
  const setQueryResult = useSetAtom(queryResultAtom);

  useEffect(() => {
    return () => {
      setQueryResult(initQueryResult);
    };
  }, []);

  return (
    <SafeAreaView style={style.wrapper}>
      <StatusBar></StatusBar>
      <SimpleAppBar title="作者"></SimpleAppBar>
      <Header></Header>
      <Body></Body>
      <MusicBar></MusicBar>
    </SafeAreaView>
  );
}

const style = StyleSheet.create({
  wrapper: {
    width: rpx(750),
    flex: 1,
  },
  body: {
    flex: 1,
  },
});
