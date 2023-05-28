import PluginManager from '@/core/pluginManager';
import {useCallback, useEffect, useRef, useState} from 'react';

export default function useAlbumDetail(
    originalAlbumItem: IAlbum.IAlbumItem | null,
) {
    const currentPageRef = useRef(1);
    const [loadMore, setLoadMore] = useState<'idle' | 'loading' | 'done'>(
        'idle',
    );
    const [albumItem, setAlbumItem] = useState<IAlbum.IAlbumItemBase | null>(
        originalAlbumItem,
    );
    const [musicList, setMusicList] = useState<IMusic.IMusicItem[]>(
        originalAlbumItem?.musicList ?? [],
    );

    const getAlbumDetail = useCallback(
        async function () {
            if (originalAlbumItem === null || loadMore !== 'idle') {
                return;
            }

            try {
                setLoadMore('loading');
                const result = await PluginManager.getByMedia(
                    originalAlbumItem,
                )?.methods?.getAlbumInfo?.(
                    originalAlbumItem,
                    currentPageRef.current,
                );
                if (result === null || result === undefined) {
                    throw new Error();
                }
                if (result?.albumItem) {
                    setAlbumItem(prev => ({
                        ...(prev ?? {}),
                        ...(result.albumItem as IAlbum.IAlbumItemBase),
                        platform: originalAlbumItem.platform,
                    }));
                }
                if (result?.musicList) {
                    setMusicList(prev => {
                        if (currentPageRef.current === 1) {
                            return result?.musicList ?? prev;
                        } else {
                            return [...prev, ...(result.musicList ?? [])];
                        }
                    });
                }
                setLoadMore(result.isEnd ? 'done' : 'idle');
                currentPageRef.current += 1;
            } catch {
                setLoadMore('idle');
            }
        },
        [loadMore],
    );

    useEffect(() => {
        getAlbumDetail();
    }, []);

    return [loadMore, albumItem, musicList, getAlbumDetail] as const;
}
