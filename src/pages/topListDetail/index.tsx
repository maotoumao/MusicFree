import React from 'react';
import useTopListDetail from './hooks/useTopListDetail';
import {useParams} from '@/core/router';
import MusicSheetPage from '@/components/musicSheetPage';

export default function TopListDetail() {
    const {pluginHash, topList} = useParams<'top-list-detail'>();
    const [topListDetail, state, loadMore] = useTopListDetail(
        topList,
        pluginHash,
    );

    return (
        <MusicSheetPage
            navTitle="榜单"
            sheetInfo={topListDetail}
            state={state}
            onLoadMore={loadMore}
            onRetry={loadMore}
        />
    );
}
