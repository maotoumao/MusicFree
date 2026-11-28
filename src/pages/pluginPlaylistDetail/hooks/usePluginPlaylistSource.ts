import { useInfiniteQuery } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';

import { showToast } from '@/components/overlay';
import { playlist, useIsPlaylistStarred } from '@/core/playlist';
import { pluginQueryKey, usePlugin } from '@/core/plugin';
import { useT } from '@/i18n';
import { mediaKey } from '@/utils/media';

import type {
    MediaRef,
    MusicItem,
    PlaylistInfoResult,
    PlaylistItemBase,
} from '@/types';
import type {
    CollectionListState,
    MusicCollectionSource,
} from '@/widgets/musicCollectionDetail/types';
import type { MusicItemOptionsSource } from '@/widgets/overlays/MusicItemOptionsPanel';

/** 无数据时返回稳定空引用，避免每次渲染新数组触发 widget 重渲染 */
const EMPTY_LIST: readonly MusicItem[] = [];

/** 远程歌单单曲「更多」= 通用来源（无「从集合移除」）；模块级常量保引用稳定，避免翻页态变化时 renderItem 失稳 */
const GENERIC_ITEM_OPTIONS: MusicItemOptionsSource = { kind: 'generic' };

/** 无 item 时的占位 ref：useIsPlaylistStarred 恒返回未收藏 */
const EMPTY_REF: MediaRef = { platform: '', id: '' };

/**
 * 插件（远程）歌单 → MusicCollectionSource
 * useInfiniteQuery 按 getPlaylistInfo(item, page) 分页：normalizer 兜 isEnd 为 boolean、显式 false 才翻页；mediaKey 去重
 * 元信息（playlistItem）先于曲目可得 → 先渲染头部、仅列表 loading；合并构造新对象、不 mutate 入站 DTO
 * 全部播放 / 加入歌单只覆盖已加载曲目
 * pending = 页面仍在领取 ticket；ticket 失效 / 插件未安装 / 首屏失败 → 错误态
 */
export function usePluginPlaylistSource(
    item: PlaylistItemBase | undefined,
    pending: boolean,
): MusicCollectionSource {
    const t = useT();
    const plugin = usePlugin(item?.platform ?? '');
    const canLoad = item != null && plugin != null;

    // 收藏：ref 取 item 的 platform+id（无 item 用占位、恒未收藏）；isStarPending 给 widget 显示切换 Spinner
    const ref = useMemo<MediaRef>(
        () => (item ? { platform: item.platform, id: item.id } : EMPTY_REF),
        [item],
    );
    const isStarred = useIsPlaylistStarred(ref);
    const [isStarPending, setIsStarPending] = useState(false);

    const queryKey = useMemo(
        () =>
            pluginQueryKey(
                item?.platform,
                'playlistInfo',
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
        queryFn: ({ pageParam }): Promise<PlaylistInfoResult | null> =>
            item && plugin
                ? plugin.methods.getPlaylistInfo(item, pageParam)
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

    // 头部元信息：入参叠加各页返回的 playlistItem（构造新对象、pin 原 platform/id、不 mutate 入站 DTO）
    const meta = useMemo(() => {
        if (!item) {
            return undefined;
        }
        let merged: PlaylistItemBase = item;
        for (const page of data?.pages ?? []) {
            if (page?.playlistItem) {
                merged = {
                    ...merged,
                    ...page.playlistItem,
                    platform: item.platform,
                    id: item.id,
                };
            }
        }
        return merged;
    }, [data, item]);

    const header = meta
        ? {
              artwork:
                  meta.artwork?.trim() || meta.coverImg?.trim() || undefined,
              fallbackIcon: 'list-music' as const,
              title: meta.title?.trim() || t('media.unknownTitle'),
              description: meta.description,
              creator: meta.artist ? { name: meta.artist } : undefined,
              // 曲数只由 PlayAllBar 表达，头部不重复（远程分页时它还会随滚动增长）
              details: [],
          }
        : { fallbackIcon: 'list-music' as const, title: '', details: [] };

    // 首屏失败 = 报错（isLoadingError = 错且无数据，排除后续页失败），或 getPlaylistInfo 首页返回 null；后续页失败只走 pagination footer 重试
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
    // 收藏切换：收藏存最全快照 meta（含插件私有字段），取消只需 ref；心形靠 isStarred 响应式翻、失败给 toast
    const toggleStar = useCallback(() => {
        if (!meta) {
            return;
        }
        setIsStarPending(true);
        const op = isStarred
            ? playlist.unstarPlaylist(ref)
            : playlist.starPlaylist(meta);
        op.then(
            () => setIsStarPending(false),
            () => {
                setIsStarPending(false);
                showToast(t('feedback.operationFailed'), { type: 'error' });
            },
        );
    }, [isStarred, meta, ref, t]);

    let listState: CollectionListState;
    if (pending || (canLoad && isLoading)) {
        listState = 'loading';
    } else if (!canLoad || initialFailed) {
        listState = 'error';
    } else {
        listState = 'ready';
    }

    return {
        kind: 'playlist',
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
        star: item
            ? {
                  isStarred,
                  isPending: isStarPending,
                  onToggle: toggleStar,
              }
            : undefined,
        overflowActions: [],
        itemOptionsSource: GENERIC_ITEM_OPTIONS,
    };
}
