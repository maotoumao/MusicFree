import React from 'react';
import MusicItem from '@/components/musicList/musicItem';

interface IMusicResultsProps {
  item: IMusic.IMusicItem;
  index: number;
}

export default function MusicResultItem(props: IMusicResultsProps) {
  const {item: musicItem} = props;

  return <MusicItem musicItem={musicItem}></MusicItem>;
}
