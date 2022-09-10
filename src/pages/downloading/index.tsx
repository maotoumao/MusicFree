import React from 'react';
import {StyleSheet} from 'react-native';
import rpx from '@/utils/rpx';
import {SafeAreaView} from 'react-native-safe-area-context';
import SimpleAppBar from '@/components/base/simpleAppBar';
import StatusBar from '@/components/base/statusBar';
import DownloadingList from './downloadingList';
import MusicBar from '@/components/musicBar';

export default function Downloading() {
    return (
        <SafeAreaView style={style.wrapper}>
            <StatusBar />
            <SimpleAppBar title="正在下载" />
            <DownloadingList />
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
