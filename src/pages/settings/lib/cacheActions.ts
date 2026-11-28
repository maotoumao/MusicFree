import { Image as ExpoImage } from 'expo-image';

import { player } from '@/core/player';

import { streamingCacheSizeQueryKey } from '../hooks/useStreamingCacheSize';

import type { QueryClient } from '@tanstack/react-query';

/** 清音乐缓存，并阻止迟到的旧容量查询覆盖清理后的真实剩余量 */
export async function clearStreamingCacheAndUpdate(
    queryClient: QueryClient,
): Promise<void> {
    const remaining = await player.clearStreamingCache();
    await queryClient.cancelQueries({
        queryKey: streamingCacheSizeQueryKey,
        exact: true,
    });
    queryClient.setQueryData(streamingCacheSizeQueryKey, remaining);
}

/** 等内存与磁盘两项都结束；任一失败或返回 false 均视为未完整清除 */
export async function clearExpoImageCache(): Promise<void> {
    const results = await Promise.allSettled([
        ExpoImage.clearMemoryCache(),
        ExpoImage.clearDiskCache(),
    ]);
    const failed = results.some(
        result => result.status === 'rejected' || result.value !== true,
    );
    if (failed) {
        throw new Error('Image cache could not be fully cleared');
    }
}
