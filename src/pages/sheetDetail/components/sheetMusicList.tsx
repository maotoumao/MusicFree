import React from 'react';
import {useRoute} from '@react-navigation/native';
import MusicSheet from '@/core/musicSheet';
import Header from './header';
import MusicList from '@/components/musicList';

export default function SheetMusicList() {
    const route = useRoute<any>();
    const id = route.params?.id ?? 'favorite';
    const musicSheet = MusicSheet.useSheets(id);

    return (
        <MusicList
            Header={<Header />}
            musicList={musicSheet?.musicList}
            musicSheet={musicSheet}
            showIndex
        />
    );
}
