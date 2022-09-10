import PluginManager from '@/core/pluginManager';
import {useEffect, useState} from 'react';

export default function useAlbumMusicList(albumItem: IAlbum.IAlbumItem | null) {
  const [musicList, setMusicList] = useState<IMusic.IMusicItem[] | null>(null);

  useEffect(() => {
    if (albumItem === null) {
      return;
    }
    console.log('HEREEEEEE');
    PluginManager.getByMedia(albumItem)?.methods?.getAlbumInfo?.(albumItem)?.then(_ => {
      console.log(_, 'WTF');
      setMusicList(_?.musicList ?? []);
    })?.catch(console.log);
  }, []);
  return musicList;
}
