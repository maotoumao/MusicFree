import React from 'react';
import Download from '@/core/download';
import MusicList from '@/components/musicList';

interface IMusicListProps {}
export default function LocalMusicList(props: IMusicListProps) {
  const downloadedMusic = Download.useDownloadedMusic();

  return <MusicList musicList={downloadedMusic} showIndex></MusicList>;
}
