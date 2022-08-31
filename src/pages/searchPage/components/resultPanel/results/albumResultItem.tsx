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

interface IAlbumResultsProps {
  item: IAlbum.IAlbumItem;
  index: number;
}
/** todo 很多rerender，需要避免掉 */
export default function AlbumResultItem(props: IAlbumResultsProps) {
  const {item: albumItem, index} = props;
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
