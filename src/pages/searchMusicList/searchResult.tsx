import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import rpx from '@/utils/rpx';
import {FlatList} from 'react-native-gesture-handler';
import MusicItem from '@/components/mediaItem/musicItem';
import Empty from '@/components/base/empty';

interface ISearchResultProps {
  result: IMusic.IMusicItem[];
}
export default function SearchResult(props: ISearchResultProps) {
  const {result} = props;
  return (
    <FlatList
    ListEmptyComponent={<Empty></Empty>}
      data={result}
      renderItem={({item}) => (
        <MusicItem musicItem={item}></MusicItem>
      )}></FlatList>
  );
}

const style = StyleSheet.create({
  wrapper: {
    width: rpx(750),
  },
});
