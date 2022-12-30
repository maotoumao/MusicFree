import PluginManager from '@/core/pluginManager';
import {useEffect, useState} from 'react';

export default function useTopListDetail(
    topListItem: IMusic.IMusicTopListItem | null,
    pluginHash: string,
) {
    const [mergedTopListItem, setMergedTopListItem] =
        useState<ICommon.WithMusicList<IMusic.IMusicTopListItem> | null>(
            topListItem,
        );
    useEffect(() => {
        if (topListItem === null) {
            return;
        }
        PluginManager.getByHash(pluginHash)
            ?.methods?.getTopListDetail(topListItem)
            ?.then(_ => {
                if (_) {
                    setMergedTopListItem(prev => ({
                        ...(prev ?? {}),
                        ...(_ ?? {}),
                    }));
                }
            });
    }, []);
    return mergedTopListItem;
}
