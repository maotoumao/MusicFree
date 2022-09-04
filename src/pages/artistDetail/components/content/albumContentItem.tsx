import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import rpx from '@/utils/rpx';
import AlbumItem from '@/components/mediaItem/albumItem';

interface IAlbumContentProps {
  item: IAlbum.IAlbumItem;
}
export default function AlbumContentItem(props: IAlbumContentProps) {
  const {item} = props;
  return <AlbumItem albumItem={item}></AlbumItem>;
}

const style = StyleSheet.create({
  wrapper: {
    width: rpx(750),
  },
});
