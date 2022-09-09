import React from 'react';
import {useRoute} from '@react-navigation/native';
import MusicSheet from '@/core/musicSheetManager';
import Header from './header';
import MusicList from '@/components/musicList';

interface IMusicListProps {}
export default function SheetMusicList(props: IMusicListProps) {
  const route = useRoute<any>();
  const id = route.params?.id ?? 'favorite';
  const musicSheet = MusicSheet.useSheets(id);

  return (
    <MusicList
      Header={<Header></Header>}
      musicList={musicSheet?.musicList}
      musicSheet={musicSheet}
      showIndex></MusicList>
  );
}
