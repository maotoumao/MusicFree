import React from 'react';
import {FlatList} from 'react-native';
import MusicQueue from '@/common/musicQueue';
import MusicListItem from '@/components/musicListItem';

interface IMusicResultsProps {
  platform: string;
  data: IPlugin.ISearchResult['music'];
}

export default function MusicResults(props: IMusicResultsProps) {
  const {platform, data} = props;

  return (
    <FlatList
      data={data ?? []}
      renderItem={({item: musicItem}) => (
        <MusicListItem
          key={`${platform}-${musicItem.id}`}
          onPress={() => {
            MusicQueue.play(musicItem);
          }}
          musicItem={musicItem}></MusicListItem>
      )}></FlatList>
  );
}
