import React from 'react';
import useAlbumDetail from './hooks/useAlbumMusicList';
import {useParams} from '@/core/router';
import MusicSheetPage from '@/components/musicSheetPage';

export default function AlbumDetail() {
    const {albumItem: originalAlbumItem} = useParams<'album-detail'>();
    const [requestStateCode, albumItem, musicList, getAlbumDetail] =
        useAlbumDetail(originalAlbumItem);

    return (
        <MusicSheetPage
            navTitle="专辑"
            sheetInfo={albumItem}
            state={requestStateCode}
            onRetry={getAlbumDetail}
            onLoadMore={getAlbumDetail}
            musicList={musicList}
        />
    );
}
