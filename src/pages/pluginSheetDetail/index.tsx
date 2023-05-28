import React from 'react';
import MusicSheetPage from '@/components/musicSheetPage';
import {useParams} from '@/entry/router';
import usePluginSheetMusicList from './hooks/usePluginSheetMusicList';

export default function PluginSheetDetail() {
    const {sheetInfo} = useParams<'plugin-sheet-detail'>();

    const [loadMore, sheetItem, musicList, getSheetDetail] =
        usePluginSheetMusicList(sheetInfo as IMusic.IMusicSheetItem);
    return (
        <MusicSheetPage
            sheetInfo={sheetItem}
            navTitle={sheetInfo?.title ?? '歌单'}
            musicList={musicList}
            loadMore={loadMore}
            onEndReached={() => {
                getSheetDetail();
            }}
        />
    );
}
