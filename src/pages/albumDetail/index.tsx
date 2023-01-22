import React from 'react';
import useAlbumDetail from './hooks/useAlbumMusicList';
import {useParams} from '@/entry/router';
import MusicSheetPage from '@/components/musicSheetPage';

export default function AlbumDetail() {
    const {albumItem} = useParams<'album-detail'>();
    const albumDetail = useAlbumDetail(albumItem);

    return <MusicSheetPage navTitle="专辑" sheetInfo={albumDetail} />;
}
