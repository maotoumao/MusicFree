import React from 'react';
import {StyleSheet} from 'react-native';
import rpx from '@/utils/rpx';
import {useNavigation} from '@react-navigation/native';
import {ROUTE_PATH} from '@/entry/router';
import ListItem from '@/components/base/listItem';
import {ImgAsset} from '@/constants/assetsConst';

interface IAlbumResultsProps {
  albumItem: IAlbum.IAlbumItem;
}

export default function AlbumItem(props: IAlbumResultsProps) {
  const {albumItem} = props;
  const navigation = useNavigation<any>();

  return (
    <ListItem
      left={{
        artwork: albumItem.artwork,
        fallback: ImgAsset.albumDefault,
      }}
      title={albumItem.title}
      desc={`${albumItem.artist}    ${albumItem.date}`}
      tag={albumItem.platform}
      onPress={() => {
        navigation.navigate(ROUTE_PATH.ALBUM_DETAIL, {
          albumItem: albumItem,
        });
      }}></ListItem>
  );
}
