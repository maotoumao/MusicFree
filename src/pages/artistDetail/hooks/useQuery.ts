import { errorLog } from "@/utils/log";
import { RequestStateCode } from "@/constants/commonConst";
import { produce } from "immer";
import { useAtom } from "jotai";
import { useCallback } from "react";
import { queryResultAtom } from "../store/atoms";
import PluginManager from "@/core/pluginManager";

export default function useQueryArtist(pluginHash: string) {
    const [queryResults, setQueryResults] = useAtom(queryResultAtom);

    const queryArtist = useCallback(
        async (
            artist: IArtist.IArtistItem,
            page?: number,
            type: IArtist.ArtistMediaType = "music",
        ) => {
            const plugin = PluginManager.getByHash(pluginHash);

            const prevResult = queryResults[type];
            if (
                prevResult?.state === RequestStateCode.PENDING_FIRST_PAGE ||
                prevResult?.state === RequestStateCode.PENDING_REST_PAGE ||
                prevResult?.state === RequestStateCode.FINISHED
            ) {
                return;
            }
            page = page ?? ((prevResult.page ?? 0) + 1);
            try {
                setQueryResults(
                    produce(draft => {
                        draft[type].state = page === 1 ? RequestStateCode.PENDING_FIRST_PAGE : RequestStateCode.PENDING_REST_PAGE;
                    }),
                );
                const result = await plugin?.methods?.getArtistWorks?.(
                    artist,
                    page,
                    type,
                );
                setQueryResults(
                    produce(draft => {
                        draft[type].page = page;
                        draft[type].state =
                            result?.isEnd === false
                                ? RequestStateCode.PARTLY_DONE
                                : RequestStateCode.FINISHED;
                        if (page === 1) {
                            // 首页
                            draft[type].data = result?.data ?? [];
                        } else {
                            draft[type].data = (draft[type].data ?? []).concat(
                                result?.data ?? [],
                            );
                        }
                    }),
                );
            } catch (e) {
                errorLog("拉取作者信息失败", e);
                setQueryResults(
                    produce(draft => {
                        draft[type].state = RequestStateCode.ERROR;
                    }),
                );
            }
        },
        [queryResults],
    );

    return queryArtist;
}
