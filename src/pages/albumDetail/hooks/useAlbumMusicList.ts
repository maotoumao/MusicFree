import PluginManager from '@/core/pluginManager';
import {useEffect, useState} from 'react';

export default function useAlbumDetail(albumItem: IAlbum.IAlbumItem | null) {
    const [mergedAlbumItem, setMergedAlbumItem] =
        useState<IAlbum.IAlbumItem | null>(albumItem);
    useEffect(() => {
        if (albumItem === null) {
            return;
        }
        PluginManager.getByMedia(albumItem)
            ?.methods?.getAlbumInfo?.(albumItem)
            ?.then(_ => {
                console.log('RES', _);
                if (_) {
                    setMergedAlbumItem(prev => ({
                        ...(prev ?? {}),
                        ...(_ ?? {}),
                    }));
                }
            });
    }, []);
    return mergedAlbumItem;
}
