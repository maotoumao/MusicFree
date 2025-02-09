import React, {useEffect, useRef, useState} from 'react';
import rpx from '@/utils/rpx';
import {FlatList} from 'react-native-gesture-handler';
import {useAtom} from 'jotai';
import {IQueryResult, scrollToTopAtom} from '../store/atoms';
import {RequestStateCode} from '@/constants/commonConst';
import useQueryArtist from '../hooks/useQuery';
import Empty from '@/components/base/empty';
import ListLoading from '@/components/base/listLoading';
import ListReachEnd from '@/components/base/listReachEnd';
import {useParams} from '@/core/router';

const ITEM_HEIGHT = rpx(120);

interface IResultListProps<T = IArtist.ArtistMediaType> {
    tab: T;
    data: IQueryResult<T>;
    renderItem: (...args: any) => any;
}
export default function ResultList(props: IResultListProps) {
    const {data, renderItem, tab} = props;
    const [scrollToTopState, setScrollToTopState] = useAtom(scrollToTopAtom);
    const lastScrollY = useRef<number>(0);
    const {pluginHash, artistItem} = useParams<'artist-detail'>();
    const [queryState, setQueryState] = useState<RequestStateCode>(
        data?.state ?? RequestStateCode.IDLE,
    );

    const queryArtist = useQueryArtist(pluginHash);

    useEffect(() => {
        queryState === RequestStateCode.IDLE && queryArtist(artistItem, 1, tab);
    }, []);

    useEffect(() => {
        setQueryState(data?.state ?? RequestStateCode.IDLE);
    }, [data]);

    return (
        <FlatList
            onScroll={e => {
                const currentY = e.nativeEvent.contentOffset.y;
                if (
                    !scrollToTopState &&
                    currentY < ITEM_HEIGHT * 8 - rpx(350)
                ) {
                    currentY < lastScrollY.current && setScrollToTopState(true);
                } else {
                    if (scrollToTopState && currentY > ITEM_HEIGHT * 8) {
                        currentY > lastScrollY.current &&
                            setScrollToTopState(false);
                    }
                }
                lastScrollY.current = currentY;
            }}
            ListEmptyComponent={<Empty />}
            ListFooterComponent={
                queryState === RequestStateCode.PENDING_REST_PAGE ? (
                    <ListLoading />
                ) : queryState === RequestStateCode.FINISHED &&
                  data.data?.length !== 0 ? (
                    <ListReachEnd />
                ) : null
            }
            onEndReached={() => {
                (queryState === RequestStateCode.IDLE ||
                    queryState === RequestStateCode.PARTLY_DONE) &&
                    queryArtist(artistItem, undefined, tab);
            }}
            getItemLayout={(_, index) => ({
                length: ITEM_HEIGHT,
                offset: ITEM_HEIGHT * index,
                index,
            })}
            overScrollMode="always"
            data={data.data ?? []}
            renderItem={renderItem}
        />
    );
}
