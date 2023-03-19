import React from 'react';
import SimpleAppBar from '@/components/base/simpleAppBar';
import StatusBar from '@/components/base/statusBar';
import DownloadingList from './downloadingList';
import MusicBar from '@/components/musicBar';
import VerticalSafeAreaView from '@/components/base/verticalSafeAreaView';
import globalStyle from '@/constants/globalStyle';

export default function Downloading() {
    return (
        <VerticalSafeAreaView style={globalStyle.fwflex1}>
            <StatusBar />
            <SimpleAppBar title="正在下载" />
            <DownloadingList />
            <MusicBar />
        </VerticalSafeAreaView>
    );
}
