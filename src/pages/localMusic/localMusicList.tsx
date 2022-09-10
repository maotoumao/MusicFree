import React from 'react';
import Download from '@/core/download';
import MusicList from '@/components/musicList';

export default function LocalMusicList() {
    const downloadedMusic = Download.useDownloadedMusic();

    return <MusicList musicList={downloadedMusic} showIndex />;
}
