import React from 'react';
import MusicQueue from '@/common/musicQueue';
import Loading from '@/components/base/loading';
import MusicList from '@/components/musicList';

interface IMusicResultsProps {
  pendingState: 'pending' | 'resolved' | 'done';
  platform: string;
  data: IPlugin.ISearchResult['music'];
}

export default function MusicResults(props: IMusicResultsProps) {
  const {data, pendingState} = props;

  return (!data || !data?.length) && pendingState === 'pending' ? (
    <Loading></Loading>
  ) : (
    <MusicList
      musicList={data}
      onItemPress={musicItem => MusicQueue.play(musicItem)}></MusicList>
  );
}
