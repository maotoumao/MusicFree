import React from 'react';
import VerticalSafeAreaView from '@/components/base/verticalSafeAreaView';
import globalStyle from '@/constants/globalStyle';
import StatusBar from '@/components/base/statusBar';
import MusicBar from '@/components/musicBar';
import Body from './components/body';
import AppBar from '@/components/base/appBar';

export default function RecommendSheets() {
    return (
        <VerticalSafeAreaView style={globalStyle.fwflex1}>
            <StatusBar />
            <AppBar>推荐歌单</AppBar>
            <Body />
            <MusicBar />
        </VerticalSafeAreaView>
    );
}
