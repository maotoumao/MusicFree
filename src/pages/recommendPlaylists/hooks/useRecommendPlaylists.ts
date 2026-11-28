import { useInfiniteQuery } from '@tanstack/react-query';

import { pluginQueryKey } from '@/core/plugin';

import type { Plugin } from '@/core/plugin';
import type {
    PaginationResponse,
    PlaylistItemBase,
    RecommendTag,
} from '@/types';

/**
 * 单个推荐源、指定分类的推荐歌单（getRecommendPlaylistsByTag 分页）
 * tag 缺省（标签未就绪）→ 不请求；仅 isEnd 显式 false 才取下一页
 * 按 platform + hash + tagId 缓存 → 切 tag 独立缓存、切回复用
 */
export function useRecommendPlaylists(
    plugin: Plugin,
    tag: RecommendTag | undefined,
) {
    return useInfiniteQuery({
        queryKey: pluginQueryKey(
            plugin.platform,
            'recommendPlaylists',
            plugin.hash,
            tag?.id,
        ),
        enabled: tag != null,
        initialPageParam: 1,
        queryFn: ({
            pageParam,
        }): Promise<PaginationResponse<PlaylistItemBase> | null> =>
            tag
                ? plugin.methods.getRecommendPlaylistsByTag(tag, pageParam)
                : Promise.resolve(null),
        getNextPageParam: (last, all) =>
            last?.isEnd === false ? all.length + 1 : undefined,
        // 遵全局「推荐/榜单」易变约定、与榜单一致：即时过期，切回显缓存 + 后台刷新
        staleTime: 0,
    });
}
