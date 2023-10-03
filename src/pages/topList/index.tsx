import React from 'react';
import TopListBody from './components/topListBody';
import MusicBar from '@/components/musicBar';
import VerticalSafeAreaView from '@/components/base/verticalSafeAreaView';
import globalStyle from '@/constants/globalStyle';
import HorizonalSafeAreaView from '@/components/base/horizonalSafeAreaView';
import AppBar from '@/components/base/appBar';

export default function TopList() {
    return (
        <VerticalSafeAreaView style={globalStyle.fwflex1}>
            <AppBar withStatusBar>榜单</AppBar>
            <HorizonalSafeAreaView style={globalStyle.flex1}>
                <TopListBody />
            </HorizonalSafeAreaView>
            <MusicBar />
        </VerticalSafeAreaView>
    );
}
