import React from 'react';
import DownloadManager from '@/core/downloadManager';
import MusicList from '@/components/musicList';

interface IMusicListProps {}
export default function LocalMusicList(props: IMusicListProps) {
  const downloadedMusic = DownloadManager.useDownloadedMusic();

  return <MusicList musicList={downloadedMusic} showIndex></MusicList>;
}
