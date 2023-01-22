import React from 'react';
import useTopListDetail from './hooks/useTopListDetail';
import {useParams} from '@/entry/router';
import MusicSheetPage from '@/components/musicSheetPage';

export default function TopListDetail() {
    const {pluginHash, topList} = useParams<'top-list-detail'>();
    const topListDetail = useTopListDetail(topList, pluginHash);

    return <MusicSheetPage navTitle="榜单" sheetInfo={topListDetail} />;
}
