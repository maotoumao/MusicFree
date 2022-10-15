import React from 'react';
import MusicList from '@/components/musicList';
import LocalMusicSheet from '@/core/localMusicSheet';

export default function LocalMusicList() {
    const musicList = LocalMusicSheet.useMusicList();

    return <MusicList musicList={musicList} showIndex />;
}
