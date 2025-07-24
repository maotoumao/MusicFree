import { RequestStateCode } from "@/constants/commonConst";
import PluginManager from "@/core/pluginManager";
import { useCallback, useEffect, useRef, useState } from "react";

export default function usePluginSheetMusicList(
    originalSheetItem: IMusic.IMusicSheetItem | null,
) {
    const currentPageRef = useRef(1);

    const [requestState, setRequestState] = useState<RequestStateCode>(RequestStateCode.IDLE);
    const [sheetItem, setSheetItem] = useState<IMusic.IMusicSheetItem | null>(
        originalSheetItem,
    );
    const [musicList, setMusicList] = useState<IMusic.IMusicItem[]>(
        originalSheetItem?.musicList ?? [],
    );

    const getSheetDetail = useCallback(
        async function () {
            // 加载中：直接退出
            if (originalSheetItem === null ||
                requestState === RequestStateCode.FINISHED ||
                requestState === RequestStateCode.PENDING_FIRST_PAGE ||
                requestState === RequestStateCode.PENDING_REST_PAGE) {
                return;
            }
            try {
                if (currentPageRef.current === 1) {
                    setRequestState(RequestStateCode.PENDING_FIRST_PAGE);
                } else {
                    setRequestState(RequestStateCode.PENDING_REST_PAGE);
                }
                const result = await PluginManager.getByMedia(
                    originalSheetItem as any,
                )?.methods?.getMusicSheetInfo?.(
                    originalSheetItem,
                    currentPageRef.current,
                );
                if (!result) {
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
                if (result.isEnd) {
                    setRequestState(RequestStateCode.FINISHED);
                } else {
                    setRequestState(RequestStateCode.PARTLY_DONE);
                }
                currentPageRef.current += 1;
            } catch {
                setRequestState(RequestStateCode.ERROR);
            }
        },
        [requestState],
    );

    useEffect(() => {
        getSheetDetail();
    }, []);

    return [requestState, sheetItem, musicList, getSheetDetail] as const;
}
