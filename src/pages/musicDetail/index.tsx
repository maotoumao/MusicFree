import StatusBar from '@/components/base/statusBar';
import rpx from '@/utils/rpx';
import React from 'react';
import {StyleSheet, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import Background from './components/background';
import Bottom from './components/bottom';
import Content from './components/content';
import NavBar from './components/navBar';

export default function MusicDetail() {
    return (
        <>
            <Background />
            <SafeAreaView style={style.wrapper}>
                <StatusBar backgroundColor={'transparent'} />
                <View style={style.container}>
                    <NavBar />
                    <Content />
                    <Bottom />
                </View>
            </SafeAreaView>
        </>
    );
}

const style = StyleSheet.create({
    wrapper: {
        width: rpx(750),
        flex: 1,
    },
    container: {
        flex: 1,
    },
});
