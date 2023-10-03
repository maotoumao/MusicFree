import React from 'react';
import StatusBar from '@/components/base/statusBar';
import DownloadingList from './downloadingList';
import MusicBar from '@/components/musicBar';
import VerticalSafeAreaView from '@/components/base/verticalSafeAreaView';
import globalStyle from '@/constants/globalStyle';
import AppBar from '@/components/base/appBar';

export default function Downloading() {
    return (
        <VerticalSafeAreaView style={globalStyle.fwflex1}>
            <StatusBar />
            <AppBar>正在下载</AppBar>
            <DownloadingList />
            <MusicBar />
        </VerticalSafeAreaView>
    );
}
