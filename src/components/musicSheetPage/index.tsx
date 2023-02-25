import React from 'react';
import {StyleSheet} from 'react-native';
import rpx from '@/utils/rpx';
import NavBar from './components/navBar';
import MusicBar from '@/components/musicBar';
import SheetMusicList from './components/sheetMusicList';
import StatusBar from '@/components/base/statusBar';
import {SafeAreaView} from 'react-native-safe-area-context';

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
        <SafeAreaView style={style.wrapper}>
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
        </SafeAreaView>
    );
}

const style = StyleSheet.create({
    wrapper: {
        width: rpx(750),
        flex: 1,
    },
});
