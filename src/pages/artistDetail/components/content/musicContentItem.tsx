import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import rpx from '@/utils/rpx';
import MusicItem from '@/components/mediaItem/musicItem';

interface IMusicContentProps {
  item: IMusic.IMusicItem
}
export default function MusicContentItem(props: IMusicContentProps) {
  const {item} = props;
  return <MusicItem musicItem={item}></MusicItem>;
}

const style = StyleSheet.create({
  wrapper: {
    width: rpx(750),
  },
});
