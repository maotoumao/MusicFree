import React from 'react';
import {FlatList, StyleSheet, Text, View} from 'react-native';
import rpx from '@/utils/rpx';
import {useNavigation} from '@react-navigation/native';
import useSearch from '@/pages/searchPage/hooks/useSearch';
import Loading from '@/components/base/loading';
import ListItem from '@/components/base/listItem';
import {ImgAsset} from '@/constants/assetsConst';
import {ROUTE_PATH} from '@/entry/router';

interface IArtistResultsProps {
  item: IArtist.IArtistItem;
  index: number;
  pluginHash: string;
}
export default function ArtistResultItem(props: IArtistResultsProps) {
  const {item: artistItem, pluginHash} = props;
  const navigation = useNavigation<any>();
  return (
    <ListItem
      left={{
        artwork: artistItem.avatar,
        fallback: ImgAsset.albumDefault,
      }}
      title={artistItem.name}
      desc={`${artistItem.worksNum}个作品    ${artistItem.description ?? ''}`}
      tag={artistItem.platform}
      onPress={() => {
        navigation.navigate(ROUTE_PATH.ARTIST_DETAIL, {
          artistItem: artistItem,
          pluginHash,
        });
      }}></ListItem>
  );
}
