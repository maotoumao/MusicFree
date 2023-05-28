import React from 'react';
import MusicSheet from '@/core/musicSheet';
import Header from './header';
import MusicList from '@/components/musicList';
import {useParams} from '@/entry/router';
import HorizonalSafeAreaView from '@/components/base/horizonalSafeAreaView';
import globalStyle from '@/constants/globalStyle';

export default function SheetMusicList() {
    const {id = 'favorite'} = useParams<'local-sheet-detail'>();
    const musicSheet = MusicSheet.useSheets(id);

    return (
        <HorizonalSafeAreaView style={globalStyle.flex1}>
            <MusicList
                Header={<Header />}
                musicList={musicSheet?.musicList}
                musicSheet={musicSheet}
                showIndex
            />
        </HorizonalSafeAreaView>
    );
}
