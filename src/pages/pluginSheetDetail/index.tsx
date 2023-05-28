import React from 'react';
import MusicSheetPage from '@/components/musicSheetPage';
import {useParams} from '@/entry/router';

export default function PluginSheetDetail() {
    const {sheetInfo} = useParams<'plugin-sheet-detail'>();
    return (
        <MusicSheetPage
            sheetInfo={sheetInfo}
            navTitle={sheetInfo?.title ?? '歌单'}
            musicList={[]}
        />
    );
}
