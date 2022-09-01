import React from 'react';
import {SectionList, StyleSheet, Text, View} from 'react-native';
import rpx from '@/utils/rpx';
import {useRoute} from '@react-navigation/native';
import {SafeAreaView} from 'react-native-safe-area-context';
import StatusBar from '@/components/base/statusBar';
import MusicBar from '@/components/musicBar';
import SimpleAppBar from '@/components/base/simpleAppBar';
import Header from './components/header';
import {ScrollView} from 'react-native-gesture-handler';
import Body from './components/body';

interface IArtistDetailProps {}
export default function ArtistDetail(props: IArtistDetailProps) {
  const route = useRoute<any>();
  const artistItem: IArtist.IArtistItem = route.params?.artistItem ?? null;
  console.log(artistItem, 'aaaA');
  return (
    <SafeAreaView style={style.wrapper}>
      <StatusBar></StatusBar>
      <SimpleAppBar title={artistItem.name}></SimpleAppBar>
      {/* <SectionList style={style.body} sections={[{data: 1}]}></SectionList> */}
      <View style={style.body}>
        <Header></Header>
        <Body></Body>
      </View>
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
