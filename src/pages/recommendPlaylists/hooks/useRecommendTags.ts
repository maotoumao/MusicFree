import { useQuery } from '@tanstack/react-query';

import { pluginQueryKey } from '@/core/plugin';

import type { Plugin } from '@/core/plugin';
import type { RecommendPlaylistTagsResult } from '@/types';

/**
 * 单个推荐源的分类标签（getRecommendPlaylistTags 单次拉取，无分页）
 * 按 platform + hash 缓存；staleTime:0 即时过期（遵全局「推荐/榜单」易变约定、与榜单一致）——切回显缓存 + 挂载后台刷新
 * 标签失败与推荐列表失败分开处理（见 RecommendSourceView）
 */
export function useRecommendTags(plugin: Plugin) {
    return useQuery<RecommendPlaylistTagsResult>({
        queryKey: pluginQueryKey(plugin.platform, 'recommendTags', plugin.hash),
        queryFn: () => plugin.methods.getRecommendPlaylistTags(),
        staleTime: 0,
    });
}
