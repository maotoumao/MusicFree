import React, {useEffect} from 'react';
import {StyleSheet, View} from 'react-native';
import rpx from '@/utils/rpx';
import NavBar from './components/navBar';
import {useAtom, useSetAtom} from 'jotai';
import {
    initSearchResults,
    PageStatus,
    pageStatusAtom,
    queryAtom,
    searchResultsAtom,
} from './store/atoms';
import HistoryPanel from './components/historyPanel';
import ResultPanel from './components/resultPanel';
import MusicBar from '@/components/musicBar';
import Loading from '@/components/base/loading';
import {SafeAreaView} from 'react-native-safe-area-context';
import StatusBar from '@/components/base/statusBar';
import NoPlugin from './components/noPlugin';

export default function () {
    const [pageStatus, setPageStatus] = useAtom(pageStatusAtom);
    const setQuery = useSetAtom(queryAtom);
    const setSearchResultsState = useSetAtom(searchResultsAtom);
    useEffect(() => {
        setSearchResultsState(initSearchResults);
        return () => {
            setPageStatus(PageStatus.EDITING);
            setQuery('');
        };
    }, []);

    return (
        <SafeAreaView style={style.wrapper}>
            <StatusBar />
            <NavBar />
            <View style={{flex: 1}}>
                {pageStatus === PageStatus.EDITING && <HistoryPanel />}
                {pageStatus === PageStatus.SEARCHING && <Loading />}
                {pageStatus === PageStatus.RESULT && <ResultPanel />}
                {pageStatus === PageStatus.NO_PLUGIN && <NoPlugin />}
            </View>
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
