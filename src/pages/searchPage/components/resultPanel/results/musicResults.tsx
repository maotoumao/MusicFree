import React from 'react';
import {FlatList} from 'react-native';
import MusicQueue from '@/common/musicQueue';
import ListItem from '@/components/listItem';
import IconButton from '@/components/iconButton';
import usePanel from '@/components/panels/usePanelShow';

interface IMusicResultsProps {
  platform: string;
  data: IPlugin.ISearchResult['music'];
}

export default function MusicResults(props: IMusicResultsProps) {
  const {platform, data} = props;
  const {showPanel} = usePanel();

  return (
    <FlatList
      data={data ?? []}
      keyExtractor={_ => `${platform}-${_.id}`}
      renderItem={({item: musicItem}) => (
        <ListItem
          title={musicItem.title}
          tag={musicItem.platform}
          desc={`${musicItem.artist} - ${musicItem.album}`}
          onPress={() => {
            MusicQueue.play(musicItem);
          }}
          right={() => (
            <IconButton
              name="dots-vertical"
              onPress={() =>
                showPanel('MusicItemOptions', {musicItem})
              }></IconButton>
          )}></ListItem>
      )}></FlatList>
  );
}
