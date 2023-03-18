import React from 'react';
import StatusBar from '@/components/base/statusBar';
import SimpleAppBar from '@/components/base/simpleAppBar';
import TopListBody from './components/topListBody';
import MusicBar from '@/components/musicBar';
import VerticalSafeAreaView from '@/components/base/verticalSafeAreaView';
import globalStyle from '@/constants/globalStyle';
import HorizonalSafeAreaView from '@/components/base/horizonalSafeAreaView';

export default function TopList() {
    return (
        <VerticalSafeAreaView style={globalStyle.fwflex1}>
            <StatusBar />
            <SimpleAppBar title="榜单" />
            <HorizonalSafeAreaView style={globalStyle.flex1}>
                <TopListBody />
            </HorizonalSafeAreaView>
            <MusicBar />
        </VerticalSafeAreaView>
    );
}
