import React from 'react';
import {StyleSheet} from 'react-native';
import rpx from '@/utils/rpx';
import {useNavigation} from '@react-navigation/native';
import {ROUTE_PATH} from '@/entry/router';
import {FlatList} from 'react-native-gesture-handler';
import ListItem from '@/components/listItem';
import useSearch from '@/pages/searchPage/hooks/useSearch';

interface IAlbumResultsProps {
  platform: string;
  data: IPlugin.ISearchResult['album'];
}
export default function AlbumResults(props: IAlbumResultsProps) {
  const {data, platform} = props;
  const navigation = useNavigation<any>();
  const search = useSearch();

  return (
    <FlatList
      data={data ?? []}
      keyExtractor={_ => `${platform}-${_.id}`}
      onEndReached={() => {
        search(undefined, platform);
      }}
      renderItem={({item: albumItem}) => (
        <ListItem
          left={{
            artwork: albumItem.artwork,
            fallback: require('@/assets/imgs/album-default.jpg'),
          }}
          title={albumItem.title}
          desc={`${albumItem.artist}    ${albumItem.date}`}
          tag={albumItem.platform}
          onPress={() => {
            navigation.navigate(ROUTE_PATH.ALBUM_DETAIL, {
              albumItem: albumItem,
            });
          }}></ListItem>
      )}></FlatList>
  );
}

const style = StyleSheet.create({
  wrapper: {
    width: rpx(750),
  },
});
