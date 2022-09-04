import React from 'react';
import {StyleSheet} from 'react-native';
import rpx from '@/utils/rpx';
import {useNavigation} from '@react-navigation/native';
import {ROUTE_PATH} from '@/entry/router';
import {FlatList} from 'react-native-gesture-handler';
import ListItem from '@/components/base/listItem';
import useSearch from '@/pages/searchPage/hooks/useSearch';
import Loading from '@/components/base/loading';
import {ImgAsset} from '@/constants/assetsConst';
import AlbumItem from '@/components/mediaItem/albumItem';

interface IAlbumResultsProps {
  item: IAlbum.IAlbumItem;
  index: number;
}
/** todo 很多rerender，需要避免掉 */
export default function AlbumResultItem(props: IAlbumResultsProps) {
  const {item: albumItem} = props;

  return <AlbumItem albumItem={albumItem}></AlbumItem>;
}
