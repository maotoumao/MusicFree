import { useQuery } from '@tanstack/react-query';

import { player } from '@/core/player';

export const streamingCacheSizeQueryKey = [
    'settings',
    'streamingCacheSize',
] as const;

/** 设置页读取 progressive 流式缓存占用；每次重新进入页面都刷新 */
export function useStreamingCacheSize() {
    return useQuery({
        queryKey: streamingCacheSizeQueryKey,
        queryFn: () => player.getStreamingCacheSize(),
        staleTime: 0,
    });
}
