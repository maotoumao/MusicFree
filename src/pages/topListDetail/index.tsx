import React from 'react';
import useTopListDetail from './hooks/useTopListDetail';
import {useParams} from '@/core/router';
import MusicSheetPage from '@/components/musicSheetPage';
import {RequestStateCode} from '@/constants/commonConst';

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
            onEndReached={loadMore}
            loadMore={state & RequestStateCode.LOADING ? 'loading' : 'done'}
        />
    );
}
