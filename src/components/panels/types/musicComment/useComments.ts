import {atom, getDefaultStore, useAtom} from 'jotai';
import {RequestStateCode} from '@/constants/commonConst.ts';
import {useEffect, useRef} from 'react';
import {isSameMediaItem} from '@/utils/mediaItem.ts';
import PluginManager from '@/core/pluginManager.ts';

const reqStateAtom = atom(RequestStateCode.PENDING_FIRST_PAGE);
const commentsAtom = atom<{
    mediaItem: ICommon.IMediaBase | null;
    comments: IMedia.IComment[];
}>({
    mediaItem: null,
    comments: [],
});

export default function useComments(mediaItem: ICommon.IMediaBase) {
    const [comments, setComments] = useAtom(commentsAtom);
    const [reqState, setReqState] = useAtom(reqStateAtom);
    const mountedRef = useRef(true);

    useEffect(() => {
        return () => {
            mountedRef.current = false;
        };
    }, []);

    useEffect(() => {
        const currentCommentsInfo = getDefaultStore().get(commentsAtom);
        if (
            isSameMediaItem(mediaItem, currentCommentsInfo.mediaItem) &&
            currentCommentsInfo.comments.length
        ) {
            setReqState(RequestStateCode.FINISHED);
            return;
        }

        const plugin = PluginManager.getByMedia(mediaItem);
        if (!plugin) {
            setReqState(RequestStateCode.ERROR);
            return;
        }
        plugin.methods
            .getMusicComments(mediaItem as any)
            .then(res => {
                console.log('here!!!');
                if (mountedRef.current) {
                    setComments({
                        mediaItem: mediaItem,
                        comments: res.data || [],
                    });
                    setReqState(RequestStateCode.FINISHED);
                }
            })
            .catch(() => {
                if (mountedRef.current) {
                    setReqState(RequestStateCode.ERROR);
                }
            });
    }, [mediaItem]);

    return [reqState, comments.comments] as const;
}
