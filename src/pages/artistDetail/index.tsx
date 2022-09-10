import React, {useEffect} from 'react';
import {StyleSheet} from 'react-native';
import rpx from '@/utils/rpx';
import {SafeAreaView} from 'react-native-safe-area-context';
import StatusBar from '@/components/base/statusBar';
import MusicBar from '@/components/musicBar';
import SimpleAppBar from '@/components/base/simpleAppBar';
import Header from './components/header';
import Body from './components/body';
import {useSetAtom} from 'jotai';
import {initQueryResult, queryResultAtom, scrollToTopAtom} from './store/atoms';

export default function ArtistDetail() {
    const setQueryResult = useSetAtom(queryResultAtom);
    const setScrollToTopState = useSetAtom(scrollToTopAtom);

    useEffect(() => {
        return () => {
            setQueryResult(initQueryResult);
            setScrollToTopState(true);
        };
    }, []);

    return (
        <SafeAreaView style={style.wrapper}>
            <StatusBar />
            <SimpleAppBar title="作者" />
            <Header />
            <Body />
            <MusicBar />
        </SafeAreaView>
    );
}

const style = StyleSheet.create({
    wrapper: {
        width: rpx(750),
        flex: 1,
    },
    body: {
        flex: 1,
    },
});
