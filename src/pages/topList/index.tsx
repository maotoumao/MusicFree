import React from 'react';
import {StyleSheet} from 'react-native';
import rpx from '@/utils/rpx';
import {SafeAreaView} from 'react-native-safe-area-context';
import StatusBar from '@/components/base/statusBar';
import SimpleAppBar from '@/components/base/simpleAppBar';
import TopListBody from './components/topListBody';
import MusicBar from '@/components/musicBar';

export default function TopList() {
    return (
        <SafeAreaView style={style.wrapper}>
            <StatusBar />
            <SimpleAppBar title="榜单" />
            <TopListBody />
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
