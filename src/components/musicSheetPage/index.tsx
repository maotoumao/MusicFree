import React from 'react';
import {StyleSheet} from 'react-native';
import rpx from '@/utils/rpx';
import NavBar from './components/navBar';
import MusicBar from '@/components/musicBar';
import AlbumMusicList from './components/albumMusicList';
import StatusBar from '@/components/base/statusBar';
import {SafeAreaView} from 'react-native-safe-area-context';

interface IMusicSheetPageProps {
    navTitle: string;
    sheetInfo: ICommon.WithMusicList<IMusic.IMusicSheetItemBase> | null;
}

export default function MusicSheetPage(props: IMusicSheetPageProps) {
    const {navTitle, sheetInfo} = props;

    return (
        <SafeAreaView style={style.wrapper}>
            <StatusBar />
            <NavBar
                musicList={sheetInfo?.musicList ?? []}
                navTitle={navTitle}
            />
            <AlbumMusicList
                sheetInfo={sheetInfo}
                musicList={sheetInfo?.musicList}
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
