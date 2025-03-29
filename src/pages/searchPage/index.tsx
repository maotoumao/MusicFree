import React, {useEffect} from 'react';
import {StyleSheet, View} from 'react-native';
import NavBar from './components/navBar';
import {useAtom, useSetAtom} from 'jotai';
import {
    initSearchResults,
    PageStatus,
    pageStatusAtom,
    queryAtom, typeAtom,
    searchResultsAtom,
} from './store/atoms';
import HistoryPanel from './components/historyPanel';
import ResultPanel from './components/resultPanel';
import MusicBar from '@/components/musicBar';
import Loading from '@/components/base/loading';
import {SafeAreaView} from 'react-native-safe-area-context';
import StatusBar from '@/components/base/statusBar';
import NoPlugin from '../../components/base/noPlugin';
import {useParams} from "@/core/router";
import useSearch from "@/pages/searchPage/hooks/useSearch";

export default function () {
    const params = useParams<'search-page'>();
    const [pageStatus, setPageStatus] = useAtom(pageStatusAtom);
    const setQuery = useSetAtom(queryAtom);
    const setType = useSetAtom(typeAtom);
    const setSearchResultsState = useSetAtom(searchResultsAtom);
    const search = useSearch();
    setQuery(params?.query || '');
    setType(params?.type);
    useEffect(() => {
        setSearchResultsState(initSearchResults);
        if (params?.query) {
            setPageStatus(PageStatus.SEARCHING);
            search(params.query, 1, params.type);
        }
        return () => {
            setPageStatus(PageStatus.EDITING);
            setQuery('');
        };
    }, []);

    return (
        <SafeAreaView edges={['bottom', 'top']} style={style.wrapper}>
            <StatusBar />
            <NavBar />
            <SafeAreaView edges={['left', 'right']} style={style.wrapper}>
                <View style={style.flex1}>
                    {pageStatus === PageStatus.EDITING && <HistoryPanel />}
                    {pageStatus === PageStatus.SEARCHING && <Loading />}
                    {pageStatus === PageStatus.RESULT && <ResultPanel />}
                    {pageStatus === PageStatus.NO_PLUGIN && (
                        <NoPlugin notSupportType="搜索" />
                    )}
                </View>
            </SafeAreaView>
            <MusicBar />
        </SafeAreaView>
    );
}

const style = StyleSheet.create({
    wrapper: {
        width: '100%',
        flex: 1,
    },
    flex1: {
        flex: 1,
    },
});
