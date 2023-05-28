import PluginManager from '@/core/pluginManager';
import {useCallback, useEffect, useRef, useState} from 'react';

export default function usePluginSheetMusicList(
    originalSheetItem: IMusic.IMusicSheetItem | null,
) {
    const currentPageRef = useRef(1);
    const [loadMore, setLoadMore] = useState<'idle' | 'loading' | 'done'>(
        'idle',
    );
    const [sheetItem, setSheetItem] = useState<IMusic.IMusicSheetItem | null>(
        originalSheetItem,
    );
    const [musicList, setMusicList] = useState<IMusic.IMusicItem[]>(
        originalSheetItem?.musicList ?? [],
    );

    const getSheetDetail = useCallback(
        async function () {
            if (originalSheetItem === null || loadMore !== 'idle') {
                return;
            }

            try {
                setLoadMore('loading');
                const result = await PluginManager.getByMedia(
                    originalSheetItem,
                )?.methods?.getMusicSheetInfo?.(
                    originalSheetItem,
                    currentPageRef.current,
                );
                console.log(result, 'ddd');
                if (result === null || result === undefined) {
                    throw new Error();
                }
                if (result?.sheetItem) {
                    setSheetItem(prev => ({
                        ...(prev ?? {}),
                        ...(result.sheetItem as IMusic.IMusicSheetItem),
                        platform: originalSheetItem.platform,
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
        getSheetDetail();
    }, []);

    return [loadMore, sheetItem, musicList, getSheetDetail] as const;
}
