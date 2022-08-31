import React from 'react';
import MusicQueue from '@/common/musicQueue';
import Loading from '@/components/base/loading';
import MusicList from '@/components/musicList';
import MusicItem from '@/components/musicList/musicItem';

interface IMusicResultsProps {
  item: IMusic.IMusicItem;
  index: number;
}

export default function MusicResults(props: IMusicResultsProps) {
  const {item: musicItem} = props;
  
  return <MusicItem musicItem={musicItem}></MusicItem>;
}
