import React from 'react';
import ComplexAppBar from '@/components/base/ComplexAppBar';
import VerticalSafeAreaView from '@/components/base/verticalSafeAreaView';
import globalStyle from '@/constants/globalStyle';
import StatusBar from '@/components/base/statusBar';
import MusicBar from '@/components/musicBar';
import Body from './components/body';

export default function RecommendSheets() {
    return (
        <VerticalSafeAreaView style={globalStyle.fwflex1}>
            <StatusBar />
            <ComplexAppBar title={'推荐歌单'} />
            <Body />
            <MusicBar />
        </VerticalSafeAreaView>
    );
}
