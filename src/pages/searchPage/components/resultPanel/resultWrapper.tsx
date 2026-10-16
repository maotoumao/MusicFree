import ListEmpty from "@/components/base/listEmpty";
import ListFooter from "@/components/base/listFooter";
import Loading from "@/components/base/loading";
import { RequestStateCode } from "@/constants/commonConst";
import useOrientation from "@/hooks/useOrientation";
import rpx from "@/utils/rpx";
import { FlashList } from "@shopify/flash-list";
import { useAtomValue } from "jotai";
import React, { memo, useCallback, useEffect } from "react";
import useSearch from "../../hooks/useSearch";
import { IAggregateMusicSearchResult, ISearchResult, queryAtom } from "../../store/atoms";
import { renderMap } from "./results";
import AggregateMusicResultItem from "./results/aggregateMusicResultItem";

interface IResultWrapperProps<
    T extends ICommon.SupportMediaType = ICommon.SupportMediaType,
> {
    tab: T;
    pluginHash: string;
    pluginName: string;
    searchResult?: ISearchResult<T> | IAggregateMusicSearchResult;
    pluginSearchResultRef: React.MutableRefObject<
        ISearchResult<T> | IAggregateMusicSearchResult | undefined
    >;
    aggregate?: boolean;
}
function ResultWrapper(props: IResultWrapperProps) {
    const { tab, pluginHash, searchResult, pluginSearchResultRef, aggregate } = props;
    const search = useSearch();
    const searchState = searchResult?.state ?? RequestStateCode.IDLE;
    const orientation = useOrientation();
    const query = useAtomValue(queryAtom);

    const ResultComponent: React.FC<any> = aggregate && tab === "music"
        ? AggregateMusicResultItem
        : renderMap[tab]!;
    const data: any = searchResult?.data ?? [];

    const keyExtractor = useCallback(
        (item: any, i: number) => aggregate ? item.key : `${i}-${item.platform}-${item.id}`,
        [aggregate],
    );

    useEffect(() => {
        if (searchState === RequestStateCode.IDLE) {
            search(query, 1, tab, pluginHash);
        }
    }, [searchState, search, query, tab, pluginHash]);

    const renderItem = ({ item, index }: any) => (
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
            ListEmptyComponent={<ListEmpty state={searchState} onRetry={() => {
                search(query, 1, tab, pluginHash);
            }} />}
            ListFooterComponent={data?.length ? <ListFooter state={searchState} onRetry={() => {
                search(undefined, undefined, tab, pluginHash);
            }} /> : null}
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
            estimatedItemSize={tab === "sheet" ? rpx(306) : rpx(120)}
            numColumns={
                tab === "sheet" ? (orientation === "vertical" ? 3 : 4) : 1
            }
            renderItem={renderItem}
            keyExtractor={keyExtractor}
        />
    );
}

export default memo(ResultWrapper);
