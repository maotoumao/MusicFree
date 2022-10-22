import React from 'react';
import MusicSheet from '@/core/musicSheet';
import Header from './header';
import MusicList from '@/components/musicList';
import {useParams} from '@/entry/router';

export default function SheetMusicList() {
    const {id = 'favorite'} = useParams<'sheet-detail'>();
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
