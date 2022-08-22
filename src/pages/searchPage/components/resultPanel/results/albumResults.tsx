import React from 'react';
import {StyleSheet} from 'react-native';
import rpx from '@/utils/rpx';
import {useAtomValue} from 'jotai';
import {searchResultsAtom} from '@/pages/searchPage/store/atoms';
import AlbumListItem from '@/components/albumListItem';
import {useNavigation} from '@react-navigation/native';
import {ROUTE_PATH} from '@/entry/router';
import {FlatList} from 'react-native-gesture-handler';

interface IAlbumResultsProps {
  platform: string;
  data: IPlugin.ISearchResult['album'];
}
export default function AlbumResults(props: IAlbumResultsProps) {
  const {data, platform} = props;
  const navigation = useNavigation<any>();


  return (
    <FlatList
      data={data ?? []}
      renderItem={({item: albumItem}) => (
        <AlbumListItem
          key={`${platform}-${albumItem.id}`}
          onPress={() => {
            navigation.navigate(ROUTE_PATH.ALBUM_DETAIL, {
              albumItem: albumItem,
            });
          }}
          albumItem={albumItem}></AlbumListItem>
      )}></FlatList>
  );
}

const style = StyleSheet.create({
  wrapper: {
    width: rpx(750),
  },
});
