import PluginManager from '@/core/plugin';
import {useEffect, useState} from 'react';

export default function useAlbumMusicList(albumItem: IAlbum.IAlbumItem | null) {
  const [musicList, setMusicList] = useState<IMusic.IMusicItem[] | null>(null);

  useEffect(() => {
    if (albumItem === null) {
      return;
    }
    PluginManager.getByMedia(albumItem)?.methods?.getAlbumInfo?.(albumItem)?.then(_ => {
      setMusicList(_?.musicList ?? []);
    })?.catch();
  }, []);
  return musicList;
}
