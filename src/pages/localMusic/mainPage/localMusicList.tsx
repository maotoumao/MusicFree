import React from 'react';
import MusicList from '@/components/musicList';
import LocalMusicSheet from '@/core/localMusicSheet';
import {localMusicSheetId} from '@/constants/commonConst';

export default function LocalMusicList() {
    const musicList = LocalMusicSheet.useMusicList();

    return (
        <MusicList
            musicList={musicList}
            showIndex
            musicSheet={{
                id: localMusicSheetId,
                title: '本地',
                musicList: musicList,
            }}
        />
    );
}
