import PluginManager from '@/core/pluginManager';
import {resetMediaItem} from '@/utils/mediaItem';
import {useCallback, useEffect, useRef, useState} from 'react';

export default function (pluginHash: string, tag: ICommon.IUnique) {
    const [sheets, setSheets] = useState<IMusic.IMusicSheetItemBase[]>([]);
    const [status, setStatus] = useState<'loading' | 'idle' | 'done'>('idle');
    const currentTagRef = useRef<string>();
    const pageRef = useRef(0);

    const query = useCallback(async () => {
        if (
            (status === 'loading' || status === 'done') &&
            currentTagRef.current === tag.id
        ) {
            return;
        }
        if (currentTagRef.current !== tag.id) {
            setSheets([]);
            pageRef.current = 0;
        }
        pageRef.current++;
        currentTagRef.current = tag.id;
        const plugin = PluginManager.getByHash(pluginHash);
        if (plugin) {
            setStatus('loading');
            const res = await plugin.methods?.getRecommendSheetsByTag?.(
                tag,
                pageRef.current,
            );
            console.log(res.isEnd);
            if (tag.id === currentTagRef.current) {
                setSheets(prev => [
                    ...prev,
                    ...res.data!.map(item =>
                        resetMediaItem(item, plugin.instance.platform),
                    ),
                ]);
            }

            if (res.isEnd) {
                setStatus('done');
            } else {
                setStatus('idle');
            }
        } else {
            setStatus('done');
            setSheets([]);
        }
    }, [tag, status]);

    useEffect(() => {
        query();
    }, [tag]);

    return [query, sheets, status] as const;
}
