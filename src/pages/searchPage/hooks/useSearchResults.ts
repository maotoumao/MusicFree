/**
 * 搜索结果编排（TanStack）：(来源, 类型, query) 独立分页，按 isEnd 翻页
 * queryKey 以叶为键命中缓存（含 hash：插件更新即失效）；空词 / 无来源不发请求
 */
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';

import { pluginQueryKey } from '@/core/plugin';
import { mediaKey } from '@/utils/media';

import type { Plugin } from '@/core/plugin';
import type { MediaItemByType, MediaType, SearchResult } from '@/types';
import type { InfiniteData } from '@tanstack/react-query';

/** 单一 (来源, 类型, query) 搜索结果，独立分页；plugin / query 为空则禁用 */
export function useSearchResults<T extends MediaType>(
    plugin: Plugin | undefined,
    type: T,
    query: string,
) {
    const queryClient = useQueryClient();
    const queryKey = useMemo(
        () =>
            pluginQueryKey(
                plugin?.platform,
                'search',
                plugin?.hash,
                type,
                query,
            ),
        [plugin?.platform, plugin?.hash, type, query],
    );
    // 空词 / 无来源不搜：enabled 挡自动请求，refresh 手动路径也要同条件早退
    // （TanStack 的 enabled:false 只挡自动 fetch，手动 refetch 仍会打）
    const canSearch = query !== '' && plugin != null;
    // 只解构用到的字段：保留 TanStack tracked-properties，未用字段变化不触发重渲染
    const {
        data,
        isLoading,
        isError,
        isRefetching,
        refetch,
        hasNextPage,
        isFetchingNextPage,
        isFetchNextPageError,
        fetchNextPage,
    } = useInfiniteQuery({
        queryKey,
        enabled: canSearch,
        initialPageParam: 1,
        queryFn: ({ pageParam }): Promise<SearchResult<T>> =>
            plugin
                ? plugin.methods.search(query, pageParam, type)
                : Promise.resolve({ data: [] }),
        // normalizer 已把 isEnd 兜为 boolean（缺省 = true = 到底）；直接信协议，未到底才取下一页
        getNextPageParam: (last, all) =>
            last.isEnd ? undefined : all.length + 1,
    });
    // 按 platform+id 去重（保留首次出现）：聚合类插件常在页内 / 跨页返回同 id
    // 重复媒体项，若原样透传会让 FlashList 的 keyExtractor 撞键、塌出空白且无法点击的格子
    const items = useMemo<MediaItemByType[T][]>(() => {
        const pages = data?.pages;
        if (!pages) {
            return [];
        }
        const seen = new Set<string>();
        const deduped: MediaItemByType[T][] = [];
        for (const page of pages) {
            for (const item of page.data) {
                const key = mediaKey(item);
                if (seen.has(key)) {
                    continue;
                }
                seen.add(key);
                deduped.push(item);
            }
        }
        return deduped;
    }, [data]);
    // 下拉刷新 / 重试只回第 1 页：先把缓存截断到首页，refetch() 便只重打 1 页（1 次请求）
    // 否则 useInfiniteQuery.refetch() 会顺序重打所有已加载页，聚合类插件易触发限流
    const refresh = useCallback(() => {
        if (!canSearch) {
            return;
        }
        queryClient.setQueryData<InfiniteData<SearchResult<T>, number>>(
            queryKey,
            prev =>
                prev
                    ? {
                          pages: prev.pages.slice(0, 1),
                          pageParams: prev.pageParams.slice(0, 1),
                      }
                    : prev,
        );
        refetch().catch(() => {});
    }, [canSearch, queryClient, queryKey, refetch]);
    return {
        items,
        isLoading,
        isError,
        isRefetching,
        refresh,
        hasNextPage,
        isFetchingNextPage,
        isFetchNextPageError,
        fetchNextPage,
    };
}
