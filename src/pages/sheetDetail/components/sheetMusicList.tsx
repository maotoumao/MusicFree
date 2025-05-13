import React from 'react';
import Header from './header';
import MusicList from '@/components/musicList';
import {useParams} from '@/core/router';
import HorizontalSafeAreaView from '@/components/base/horizontalSafeAreaView.tsx';
import globalStyle from '@/constants/globalStyle';
import { useSheetItem } from '@/core/musicSheet';

export default function SheetMusicList() {
    const {id = 'favorite'} = useParams<'local-sheet-detail'>();
    const musicSheet = useSheetItem(id);

    return (
        <HorizontalSafeAreaView style={globalStyle.flex1}>
            <MusicList
                Header={<Header />}
                musicList={musicSheet?.musicList}
                musicSheet={musicSheet}
                showIndex
            />
        </HorizontalSafeAreaView>
    );
}
