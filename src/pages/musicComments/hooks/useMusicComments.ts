import { useInfiniteQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef } from 'react';

import { pluginQueryKey, usePlugin } from '@/core/plugin';

import type { Comment, MusicItem } from '@/types';

/** 整页被归一清空时自动续拉的最大页数，防插件连续返回空页把请求刷爆 */
const MAX_AUTO_PAGES = 3;

export interface CommentsQuery {
    comments: readonly Comment[];
    /** 首屏加载中（尚无任何数据） */
    isLoading: boolean;
    /** 首屏失败 */
    isError: boolean;
    /** 该音源不支持评论：入口本应置灰，此处兜底不发请求 */
    unsupported: boolean;
    hasNextPage: boolean;
    isFetchingNextPage: boolean;
    /** 加载下一页失败（已有数据，页尾可重试） */
    isFetchNextPageError: boolean;
    fetchNextPage: () => void;
    /** 首屏失败后重试 */
    retry: () => void;
}

/**
 * 歌曲评论分页查询：插件 getMusicComments 逐页拉取，isEnd 即到底
 * 只读；评论无稳定唯一键（id 可缺），列表 key 由调用方按位置兜底
 */
export function useMusicComments(item: MusicItem | undefined): CommentsQuery {
    const plugin = usePlugin(item?.platform ?? '');
    const supported = plugin?.supportedMethods.has('getMusicComments') ?? false;
    const enabled = item != null && supported;
    const queryKey = useMemo(
        () =>
            pluginQueryKey(
                item?.platform,
                'musicComments',
                plugin?.hash,
                item?.id,
            ),
        [item?.platform, item?.id, plugin?.hash],
    );
    const {
        data,
        isLoading,
        isLoadingError,
        isFetching,
        hasNextPage,
        isFetchingNextPage,
        isFetchNextPageError,
        fetchNextPage,
        refetch,
    } = useInfiniteQuery({
        queryKey,
        enabled,
        // 评论时效性弱，返回本页时不重新请求；超过 1 分钟再进入才刷新
        staleTime: 60_000,
        initialPageParam: 1,
        queryFn: ({ pageParam }) =>
            item && plugin?.methods.getMusicComments
                ? plugin.methods.getMusicComments(item, pageParam)
                : Promise.resolve({ data: [], isEnd: true }),
        getNextPageParam: (last, all) =>
            last.isEnd ? undefined : all.length + 1,
    });

    const comments = useMemo<readonly Comment[]>(
        () => data?.pages.flatMap(page => page.data ?? []) ?? [],
        [data],
    );

    // 归一会丢掉无正文的脏条目，插件也可能返回非终止空页 —— 一整页被清空时列表不渲染，
    // 触底回调无从触发，会卡在空态。故在无内容且还有下一页时自动续拉，并限次防插件连续空页刷爆
    const autoPagesRef = useRef(0);
    const emptyWithMore = enabled && comments.length === 0 && hasNextPage;
    useEffect(() => {
        if (!emptyWithMore) {
            autoPagesRef.current = 0;
            return;
        }
        if (
            isFetching ||
            isFetchNextPageError ||
            autoPagesRef.current >= MAX_AUTO_PAGES
        ) {
            return;
        }
        autoPagesRef.current += 1;
        fetchNextPage({ cancelRefetch: false }).catch(() => {});
    }, [
        emptyWithMore,
        isFetching,
        isFetchNextPageError,
        fetchNextPage,
        comments.length,
    ]);
    // 续拉过程对用户就是「还在加载」，别闪一下空态
    const autoLoading = emptyWithMore && autoPagesRef.current < MAX_AUTO_PAGES;

    return {
        comments,
        isLoading: enabled && (isLoading || autoLoading),
        // 只认首屏失败：翻页失败另有页尾重试，不该把整页顶掉
        isError: isLoadingError,
        unsupported: item != null && !supported,
        hasNextPage,
        isFetchingNextPage,
        isFetchNextPageError,
        fetchNextPage: () => {
            // 不打断进行中的请求，避免快速滚动时反复取消重发
            fetchNextPage({ cancelRefetch: false }).catch(() => {});
        },
        retry: () => {
            refetch().catch(() => {});
        },
    };
}
