import React, {useEffect, useState} from 'react';
import {ScrollView, StyleSheet, View} from 'react-native';
import rpx from '@/utils/rpx';
import Loading from '@/components/base/loading';
import Chip from '@/components/base/chip';
import useSearch from '../hooks/useSearch';
import {
    addHistory,
    getHistory,
    removeAllHistory,
    removeHistory,
} from '../common/historySearch';
import {useSetAtom} from 'jotai';
import {
    initSearchResults,
    PageStatus,
    pageStatusAtom,
    queryAtom,
    searchResultsAtom,
} from '../store/atoms';
import ThemeText from '@/components/base/themeText';
import Button from '@/components/base/textButton.tsx';
import Empty from '@/components/base/empty';

export default function () {
    const [history, setHistory] = useState<string[] | null>(null);
    const search = useSearch();

    const setQuery = useSetAtom(queryAtom);
    const setPageStatus = useSetAtom(pageStatusAtom);
    const setSearchResultsState = useSetAtom(searchResultsAtom);

    useEffect(() => {
        getHistory().then(setHistory);
    }, []);

    return (
        <View style={style.wrapper}>
            {history === null ? (
                <Loading />
            ) : (
                <>
                    <View style={style.header}>
                        <ThemeText fontSize="title" fontWeight="semibold">
                            历史记录
                        </ThemeText>
                        <Button
                            fontColor="textSecondary"
                            onPress={async () => {
                                await removeAllHistory();
                                getHistory().then(setHistory);
                            }}>
                            清空
                        </Button>
                    </View>
                    <ScrollView
                        style={style.historyContent}
                        contentContainerStyle={style.historyContentConainer}>
                        {history.length ? (
                            history.map(_ => (
                                <Chip
                                    key={`search-history-${_}`}
                                    containerStyle={style.chip}
                                    onClose={async () => {
                                        await removeHistory(_);
                                        getHistory().then(setHistory);
                                    }}
                                    onPress={() => {
                                        setSearchResultsState(
                                            initSearchResults,
                                        );
                                        setPageStatus(PageStatus.SEARCHING);
                                        search(_, 1);
                                        addHistory(_);
                                        setQuery(_);
                                    }}>
                                    {_}
                                </Chip>
                            ))
                        ) : (
                            <Empty />
                        )}
                    </ScrollView>
                </>
            )}
        </View>
    );
}

const style = StyleSheet.create({
    wrapper: {
        width: '100%',
        maxWidth: '100%',
        flexDirection: 'column',
        padding: rpx(24),
        flex: 1,
    },
    header: {
        width: '100%',
        flexDirection: 'row',
        paddingVertical: rpx(28),
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    historyContent: {
        width: '100%',
        flex: 1,
    },
    historyContentConainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
    },
    chip: {
        flexGrow: 0,
        marginRight: rpx(24),
        marginBottom: rpx(24),
    },
});
