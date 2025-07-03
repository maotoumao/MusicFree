import { RequestStateCode } from "@/constants/commonConst";
import PluginManager from "@/core/pluginManager";
import { resetMediaItem } from "@/utils/mediaUtils";
import { useCallback, useEffect, useRef, useState } from "react";

export default function (pluginHash: string, tag: ICommon.IUnique) {
    const [sheets, setSheets] = useState<IMusic.IMusicSheetItemBase[]>([]);
    const [requestState, setRequestState] = useState(RequestStateCode.IDLE);
    const currentTagRef = useRef<string>();
    const pageRef = useRef(0);

    const query = useCallback(async () => {
        if (
            (requestState === RequestStateCode.FINISHED ||
                requestState === RequestStateCode.PENDING_FIRST_PAGE ||
                requestState === RequestStateCode.PENDING_REST_PAGE) &&
            currentTagRef.current === tag.id
        ) {
            return;
        }
        try {
            if (currentTagRef.current !== tag.id) {
                setSheets([]);
                pageRef.current = 0;
            }
            pageRef.current++;
            currentTagRef.current = tag.id;
            const plugin = PluginManager.getByHash(pluginHash);
            if (plugin) {
                if (pageRef.current === 1) {
                    setRequestState(RequestStateCode.PENDING_FIRST_PAGE);
                } else {
                    setRequestState(RequestStateCode.PENDING_REST_PAGE);
                }
                const res = await plugin.methods?.getRecommendSheetsByTag?.(
                    tag,
                    pageRef.current,
                );
                
                if (res.isEnd) {
                    setRequestState(RequestStateCode.FINISHED);
                } else {
                    setRequestState(RequestStateCode.PARTLY_DONE);
                }
                if (tag.id === currentTagRef.current) {
                    setSheets(prev => [
                        ...prev,
                        ...res.data!.map(item =>
                            resetMediaItem(item, plugin.instance.platform),
                        ),
                    ]);
                }

            } else {
                setRequestState(RequestStateCode.FINISHED);
                setSheets([]);
            }
        } catch {
            setRequestState(RequestStateCode.ERROR);
        }
    }, [tag, requestState]);

    useEffect(() => {
        query();
    }, [tag]);


    return [query, sheets, requestState] as const;
}
