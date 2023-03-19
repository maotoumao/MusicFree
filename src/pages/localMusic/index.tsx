import React from 'react';
import StatusBar from '@/components/base/statusBar';
import MainPage from './mainPage';
import VerticalSafeAreaView from '@/components/base/verticalSafeAreaView';
import globalStyle from '@/constants/globalStyle';

export default function LocalMusic() {
    return (
        <VerticalSafeAreaView style={globalStyle.fwflex1}>
            <StatusBar />
            <MainPage />
        </VerticalSafeAreaView>
    );
}
