import React from 'react';
import {StyleSheet} from 'react-native';
import rpx from '@/utils/rpx';
import NavBar from './components/navBar';
import MusicBar from '@/components/musicBar';
import SheetMusicList from './components/sheetMusicList';
import {SafeAreaView} from 'react-native-safe-area-context';
import StatusBar from '@/components/base/statusBar';

export default function SheetDetail() {
    return (
        <SafeAreaView style={style.wrapper}>
            <StatusBar />
            <NavBar />
            <SheetMusicList />
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
