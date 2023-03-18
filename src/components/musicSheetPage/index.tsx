import React from 'react';
import NavBar from './components/navBar';
import MusicBar from '@/components/musicBar';
import SheetMusicList from './components/sheetMusicList';
import StatusBar from '@/components/base/statusBar';
import globalStyle from '@/constants/globalStyle';
import VerticalSafeAreaView from '../base/verticalSafeAreaView';

interface IMusicSheetPageProps {
    navTitle: string;
    sheetInfo: ICommon.WithMusicList<IMusic.IMusicSheetItemBase> | null;
    musicList?: IMusic.IMusicItem[] | null;
    onEndReached?: () => void;
    loadMore?: 'loading' | 'done' | 'none';
}

export default function MusicSheetPage(props: IMusicSheetPageProps) {
    const {navTitle, sheetInfo, musicList, onEndReached, loadMore} = props;

    return (
        <VerticalSafeAreaView style={globalStyle.fwflex1}>
            <StatusBar />
            <NavBar
                musicList={musicList ?? sheetInfo?.musicList ?? []}
                navTitle={navTitle}
            />
            <SheetMusicList
                sheetInfo={sheetInfo}
                musicList={musicList ?? sheetInfo?.musicList}
                onEndReached={() => {
                    onEndReached?.();
                }}
                loadMore={loadMore}
            />
            <MusicBar />
        </VerticalSafeAreaView>
    );
}
