import { useInfiniteQuery } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';

import { pluginQueryKey, usePlugin } from '@/core/plugin';
import { useT } from '@/i18n';
import { mediaKey } from '@/utils/media';

import type { AlbumInfoResult, AlbumItemBase, MusicItem } from '@/types';
import type {
    CollectionListState,
    MusicCollectionSource,
} from '@/widgets/musicCollectionDetail/types';
import type { MusicItemOptionsSource } from '@/widgets/overlays/MusicItemOptionsPanel';

/** 无数据时返回稳定空引用，避免每次渲染新数组触发 widget 重渲染 */
const EMPTY_LIST: readonly MusicItem[] = [];

/** 远程专辑单曲「更多」= 通用来源（无「从集合移除」）；模块级常量保引用稳定，避免翻页态变化时 renderItem 失稳 */
const GENERIC_ITEM_OPTIONS: MusicItemOptionsSource = { kind: 'generic' };

/**
 * 插件（远程）专辑 → MusicCollectionSource
 * useInfiniteQuery 按 getAlbumInfo(item, page) 分页：normalizer 兜 isEnd 为 boolean、显式 false 才翻页；mediaKey 去重
 * 元信息（albumItem）先于曲目可得 → 先渲染头部、仅列表 loading；合并构造新对象、不 mutate 入站 DTO
 * 全部播放 / 加入歌单只覆盖已加载曲目；专辑无收藏、无排序
 * pending = 页面仍在领取 ticket；ticket 失效 / 插件未安装 / 首屏失败 → 错误态
 */
export function usePluginAlbumSource(
    item: AlbumItemBase | undefined,
    pending: boolean,
): MusicCollectionSource {
    const t = useT();
    const plugin = usePlugin(item?.platform ?? '');
    const canLoad = item != null && plugin != null;

    const queryKey = useMemo(
        () =>
            pluginQueryKey(item?.platform, 'albumInfo', plugin?.hash, item?.id),
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
        queryFn: ({ pageParam }): Promise<AlbumInfoResult | null> =>
            item && plugin
                ? plugin.methods.getAlbumInfo(item, pageParam)
                : Promise.resolve(null),
        // 仅 isEnd 显式 false 才取下一页；到底 / null 页即停
        getNextPageParam: (last, all) =>
            last?.isEnd === false ? all.length + 1 : undefined,
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

    // 头部元信息：入参叠加各页返回的 albumItem（构造新对象、pin 原 platform/id、不 mutate 入站 DTO）
    const meta = useMemo(() => {
        if (!item) {
            return undefined;
        }
        let merged: AlbumItemBase = item;
        for (const page of data?.pages ?? []) {
            if (page?.albumItem) {
                merged = {
                    ...merged,
                    ...page.albumItem,
                    platform: item.platform,
                    id: item.id,
                };
            }
        }
        return merged;
    }, [data, item]);

    // 插件数据不可信：title 类型虽标必填、运行时仍可能缺失或非串 → typeof 兜底避免 trim 崩溃
    const rawTitle: unknown = meta?.title;
    const title =
        typeof rawTitle === 'string' && rawTitle.trim()
            ? rawTitle.trim()
            : t('media.unknownTitle');

    const header = meta
        ? {
              artwork: meta.artwork?.trim() || undefined,
              fallbackIcon: 'disc-3' as const,
              title,
              description: meta.description,
              creator: meta.artist ? { name: meta.artist } : undefined,
              // 曲数只由 PlayAllBar 表达，头部不重复（远程分页时它还会随滚动增长）
              details: [],
          }
        : { fallbackIcon: 'disc-3' as const, title: '', details: [] };

    // 首屏失败 = 报错（isLoadingError = 错且无数据，排除后续页失败），或 getAlbumInfo 首页返回 null；后续页失败只走 pagination footer 重试
    const firstPage = data?.pages[0];
    const initialFailed =
        canLoad && (isLoadingError || (data != null && firstPage == null));

    const retryInitialLoad = useCallback(() => {
        refetch().catch(() => {});
    }, [refetch]);
    const loadMore = useCallback(() => {
        // cancelRefetch:false —— 在途翻页时忽略重复触发（触底 / 重试连点），不打断在途请求
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
        kind: 'album',
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
        overflowActions: [],
        itemOptionsSource: GENERIC_ITEM_OPTIONS,
    };
}
