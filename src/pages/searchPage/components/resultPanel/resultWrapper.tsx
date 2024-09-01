import React, {memo, useCallback, useEffect, useState} from 'react';
import {useAtomValue} from 'jotai';
import {ISearchResult, queryAtom} from '../../store/atoms';
import {renderMap} from './results';
import useSearch from '../../hooks/useSearch';
import Loading from '@/components/base/loading';
import {RequestStateCode} from '@/constants/commonConst';
import ListLoading from '@/components/base/listLoading';
import Empty from '@/components/base/empty';
import ListReachEnd from '@/components/base/listReachEnd';
import useOrientation from '@/hooks/useOrientation';
import {FlashList} from '@shopify/flash-list';
import rpx from '@/utils/rpx';
import {StyleSheet, View} from 'react-native';

interface IResultWrapperProps<
    T extends ICommon.SupportMediaType = ICommon.SupportMediaType,
> {
    tab: T;
    pluginHash: string;
    pluginName: string;
    searchResult: ISearchResult<T>;
    pluginSearchResultRef: React.MutableRefObject<ISearchResult<T>>;
}
function ResultWrapper(props: IResultWrapperProps) {
    const {tab, pluginHash, searchResult, pluginSearchResultRef} = props;
    const search = useSearch();
    const [searchState, setSearchState] = useState<RequestStateCode>(
        searchResult?.state ?? RequestStateCode.IDLE,
    );
    const orientation = useOrientation();
    const query = useAtomValue(queryAtom);

    const ResultComponent = renderMap[tab]!;
    const data: any = searchResult?.data ?? [];

    const keyExtractor = useCallback(
        (item: any, i: number) => `${i}-${item.platform}-${item.id}`,
        [],
    );

    useEffect(() => {
        if (searchState === RequestStateCode.IDLE) {
            search(query, 1, tab, pluginHash);
        }
    }, []);

    useEffect(() => {
        setSearchState(searchResult?.state ?? RequestStateCode.IDLE);
    }, [searchResult]);

    const renderItem = ({item, index}: any) => (
        <ResultComponent
            item={item}
            index={index}
            pluginHash={pluginHash}
            pluginSearchResultRef={pluginSearchResultRef}
        />
    );

    return searchState === RequestStateCode.PENDING_FIRST_PAGE ? (
        <Loading />
    ) : (
        <FlashList
            extraData={searchState}
            ListEmptyComponent={() =>
                searchState & RequestStateCode.LOADING ? null : <Empty />
            }
            ListFooterComponent={() => (
                <View style={style.wrapper}>
                    {searchState === RequestStateCode.PENDING_REST_PAGE ? (
                        <ListLoading />
                    ) : searchState === RequestStateCode.FINISHED ? (
                        <ListReachEnd />
                    ) : (
                        <></>
                    )}
                </View>
            )}
            data={data}
            refreshing={false}
            onRefresh={() => {
                search(query, 1, tab, pluginHash);
            }}
            onEndReached={() => {
                (searchState === RequestStateCode.PARTLY_DONE ||
                    searchState === RequestStateCode.IDLE) &&
                    search(undefined, undefined, tab, pluginHash);
            }}
            estimatedItemSize={tab === 'sheet' ? rpx(306) : rpx(120)}
            numColumns={
                tab === 'sheet' ? (orientation === 'vertical' ? 3 : 4) : 1
            }
            renderItem={renderItem}
            keyExtractor={keyExtractor}
        />
    );
}

export default memo(ResultWrapper);
const style = StyleSheet.create({
    wrapper: {
        width: '100%',
        height: rpx(140),
        justifyContent: 'center',
        alignItems: 'center',
    },
});
