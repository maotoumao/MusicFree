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
    loadMore?: 'loading' | 'done' | 'idle';
    // 是否可收藏
    canStar?: boolean;
}

export default function MusicSheetPage(props: IMusicSheetPageProps) {
    const {navTitle, sheetInfo, musicList, onEndReached, loadMore, canStar} =
        props;

    return (
        <VerticalSafeAreaView style={globalStyle.fwflex1}>
            <StatusBar />
            <NavBar
                musicList={musicList ?? sheetInfo?.musicList ?? []}
                navTitle={navTitle}
            />
            <SheetMusicList
                canStar={canStar}
                sheetInfo={sheetInfo as any}
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
