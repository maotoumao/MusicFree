import { useInfiniteQuery } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';

import { pluginQueryKey, usePlugin } from '@/core/plugin';
import { useT } from '@/i18n';
import { mediaKey } from '@/utils/media';
import { firstNonBlank } from '@/utils/text';

import type { MusicItem, PlaylistItemBase, TopListInfoResult } from '@/types';
import type {
    CollectionListState,
    MusicCollectionSource,
} from '@/widgets/musicCollectionDetail/types';
import type { MusicItemOptionsSource } from '@/widgets/overlays/MusicItemOptionsPanel';

/** 无数据时返回稳定空引用，避免每次渲染新数组触发 widget 重渲染 */
const EMPTY_LIST: readonly MusicItem[] = [];

/** 榜单单曲「更多」= 通用来源（无「从集合移除」）；模块级常量保引用稳定 */
const GENERIC_ITEM_OPTIONS: MusicItemOptionsSource = { kind: 'generic' };

/**
 * 插件榜单 → MusicCollectionSource（kind='topList'）
 * useInfiniteQuery 按 getTopListDetail(item, page) 分页：normalizer 兜 isEnd、显式 false 才翻页；mediaKey 去重
 * 元信息 topListItem 先于曲目可得 → 先渲染头部；合并构造新对象、不 mutate 入站 DTO
 * 榜单无收藏概念（不提供 star）、无编辑（overflowActions 空）；不把入口 artist 当作创建者
 * pending = 页面仍在领取 ticket；ticket 失效 / 插件未安装 / 首屏失败 → 错误态
 */
export function useTopListSource(
    item: PlaylistItemBase | undefined,
    pending: boolean,
): MusicCollectionSource {
    const t = useT();
    const plugin = usePlugin(item?.platform ?? '');
    const canLoad = item != null && plugin != null;

    const queryKey = useMemo(
        () =>
            pluginQueryKey(
                item?.platform,
                'topListDetail',
                plugin?.hash,
                item?.id,
            ),
        [item?.platform, plugin?.hash, item?.id],
    );
    const {
        data,
        isLoading,
        isLoadingError,
        hasNextPage,
        isFetchingNextPage,
        isFetchNextPageError,
        fetchNextPage,
        refetch,
    } = useInfiniteQuery({
        queryKey,
        enabled: canLoad,
        initialPageParam: 1,
        queryFn: ({ pageParam }): Promise<TopListInfoResult | null> =>
            item && plugin
                ? plugin.methods.getTopListDetail(item, pageParam)
                : Promise.resolve(null),
        // 仅 isEnd 显式 false 才取下一页；到底 / null 页即停
        getNextPageParam: (last, all) =>
            last?.isEnd === false ? all.length + 1 : undefined,
        // 榜单易变：立即过期，挂载时后台刷新（与 useTopLists 一致）
        staleTime: 0,
    });

    // 拼接各页 musicList、按 mediaKey 去重（保留首现）——聚合插件常跨页返回同 id
    const musicList = useMemo<readonly MusicItem[]>(() => {
        const pages = data?.pages;
        if (!pages) {
            return EMPTY_LIST;
        }
        const seen = new Set<string>();
        const deduped: MusicItem[] = [];
        for (const page of pages) {
            for (const music of page?.musicList ?? []) {
                const key = mediaKey(music);
                if (seen.has(key)) {
                    continue;
                }
                seen.add(key);
                deduped.push(music);
            }
        }
        return deduped;
    }, [data]);

    // 各页 topListItem 合并（后页覆盖前页；不含入口 item，供逐字段回退）
    const detail = useMemo(() => {
        let merged: Partial<PlaylistItemBase> = {};
        for (const page of data?.pages ?? []) {
            if (page?.topListItem) {
                merged = { ...merged, ...page.topListItem };
            }
        }
        return merged;
    }, [data]);

    // 逐字段安全取值：详情有效 → 入口有效 → 通用 fallback（防插件非字符串 / 空白污染头部）
    const header = item
        ? {
              artwork: firstNonBlank(
                  detail.artwork,
                  detail.coverImg,
                  item.artwork,
                  item.coverImg,
              ),
              fallbackIcon: 'list-music' as const,
              title:
                  firstNonBlank(detail.title, item.title) ??
                  t('media.unknownTitle'),
              description: firstNonBlank(detail.description, item.description),
              // 不把入口 artist 当创建者；曲数只由 PlayAllBar 表达，头部不重复
              details: [],
          }
        : { fallbackIcon: 'list-music' as const, title: '', details: [] };

    // 首屏失败 = 报错（isLoadingError = 错且无数据），或 getTopListDetail 首页返回 null；后续页失败只走 pagination footer
    const firstPage = data?.pages[0];
    const initialFailed =
        canLoad && (isLoadingError || (data != null && firstPage == null));

    const retryInitialLoad = useCallback(() => {
        refetch().catch(() => {});
    }, [refetch]);
    const loadMore = useCallback(() => {
        // cancelRefetch:false —— 在途翻页时忽略重复触发，不打断在途请求
        fetchNextPage({ cancelRefetch: false }).catch(() => {});
    }, [fetchNextPage]);

    let listState: CollectionListState;
    if (pending || (canLoad && isLoading)) {
        listState = 'loading';
    } else if (!canLoad || initialFailed) {
        listState = 'error';
    } else {
        listState = 'ready';
    }

    return {
        kind: 'topList',
        header,
        musicList,
        listState,
        retryInitialLoad: initialFailed ? retryInitialLoad : undefined,
        pagination: canLoad
            ? {
                  hasMore: hasNextPage,
                  isLoadingMore: isFetchingNextPage,
                  hasLoadMoreError: isFetchNextPageError,
                  loadMore,
              }
            : undefined,
        // 榜单无收藏概念：不提供 star → 不渲染收藏按钮
        // 榜单无编辑动作
        overflowActions: [],
        itemOptionsSource: GENERIC_ITEM_OPTIONS,
    };
}
