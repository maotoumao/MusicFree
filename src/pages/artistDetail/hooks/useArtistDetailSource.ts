import { useInfiniteQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { pluginQueryKey, usePlugin } from '@/core/plugin';
import { useT } from '@/i18n';
import { mediaKey } from '@/utils/media';
import { firstNonBlank } from '@/utils/text';

import {
    deriveVisibleTypes,
    derivePageState,
    evidenceOf,
} from './artistWorksState';

import type { ArtistPageState } from './artistWorksState';
import type {
    AlbumItemBase,
    ArtistItem,
    ArtistMediaType,
    MusicItem,
    SearchResult,
} from '@/types';

/** 歌手头部展示资料（从 ArtistItem 派生，纯 UI、无来源态） */
export interface ArtistProfile {
    name: string;
    avatar?: string;
    fans?: number;
    worksNum?: number;
    description?: string;
}

/** 单类作品（music｜album）的分页视图态：字段与 MediaList props 对齐、直接喂入 */
export interface PaginatedArtistWorks<T> {
    items: readonly T[];
    /** 首屏加载中（无数据时显示骨架 / loading） */
    isLoading: boolean;
    /** 首屏失败（可重试） */
    isError: boolean;
    retry(): void;
    hasNextPage: boolean;
    isFetchingNextPage: boolean;
    isFetchNextPageError: boolean;
    fetchNextPage(): void;
}

/** 歌手详情页数据源：头部资料 + 可见 tab + 当前类型 + 两类独立分页作品 */
export interface ArtistDetailSource {
    pageState: ArtistPageState;
    profile: ArtistProfile;
    /** 应显示的作品 tab（乐观展示 + 失败保留重试；已确认空的类型剔除） */
    visibleTypes: readonly ArtistMediaType[];
    /** 生效的当前 tab（受 visibleTypes 约束，不会指向已隐藏类型） */
    activeType: ArtistMediaType;
    selectType(type: ArtistMediaType): void;
    music: PaginatedArtistWorks<MusicItem>;
    album: PaginatedArtistWorks<AlbumItemBase>;
}

const EMPTY_MUSIC: readonly MusicItem[] = [];
const EMPTY_ALBUM: readonly AlbumItemBase[] = [];

/** 拼接各页 data、按 mediaKey 去重（保留首现）——聚合插件常跨页返回同 id */
function collectItems<T extends MusicItem | AlbumItemBase>(
    pages: ({ data?: readonly T[] } | null)[] | undefined,
    empty: readonly T[],
): readonly T[] {
    if (!pages) {
        return empty;
    }
    const seen = new Set<string>();
    const out: T[] = [];
    for (const page of pages) {
        for (const item of page?.data ?? []) {
            const key = mediaKey(item);
            if (seen.has(key)) {
                continue;
            }
            seen.add(key);
            out.push(item);
        }
    }
    return out.length > 0 ? out : empty;
}

/**
 * 歌手作品数据层：music / album 两类各自独立 useInfiniteQuery（getArtistWorks 分页），互不共享页码 / isEnd / 错误 / 数组
 * 能力门控走 supportedMethods（methods 门面对已装插件恒在，不能用于判断可选能力）
 * 探测编排：默认拉 music；music 有数据→乐观显示两 tab、album 点开才拉；music 确认空→探测 album 以发现「仅专辑」歌手
 * 类型存在性据缓存证据派生（不被后台刷新失败推翻）；两类都空 / 方法缺失 → 页面级空 / 不可用态
 * 本地态（activeType / album 探测）随歌手切换重置由调用方 key=ticket 承担；pending = 仍在领取 ticket
 */
export function useArtistDetailSource(
    item: ArtistItem | undefined,
    pending: boolean,
): ArtistDetailSource {
    const t = useT();
    const plugin = usePlugin(item?.platform ?? '');
    const canGetWorks = plugin?.supportedMethods.has('getArtistWorks') ?? false;
    const canLoad = item != null && canGetWorks;

    // 当前 tab（单 hook 持有、无跨组件共享 → useState 足够；随歌手切换的重置由调用方 key 承担）
    const [activeType, setActiveType] = useState<ArtistMediaType>('music');
    // music 确认空后置真，触发一次性 album 探测（发现「仅专辑」歌手）
    const [albumProbeRequested, setAlbumProbeRequested] = useState(false);

    const musicQuery = useInfiniteQuery({
        queryKey: pluginQueryKey(
            item?.platform,
            'artistWorks',
            plugin?.hash,
            item?.id,
            'music',
        ),
        enabled: canLoad,
        initialPageParam: 1,
        queryFn: ({ pageParam }): Promise<SearchResult<'music'> | null> =>
            item && plugin
                ? plugin.methods.getArtistWorks(item, pageParam, 'music')
                : Promise.resolve(null),
        getNextPageParam: (last, all) =>
            last?.isEnd === false ? all.length + 1 : undefined,
        // 遵全局「歌手作品」易变约定：即时过期，切回显缓存 + 后台刷新
        staleTime: 0,
    });

    // album 惰性：用户切到专辑 tab、或 music 空触发探测后才请求
    const albumEnabled =
        canLoad && (activeType === 'album' || albumProbeRequested);
    const albumQuery = useInfiniteQuery({
        queryKey: pluginQueryKey(
            item?.platform,
            'artistWorks',
            plugin?.hash,
            item?.id,
            'album',
        ),
        enabled: albumEnabled,
        initialPageParam: 1,
        queryFn: ({ pageParam }): Promise<SearchResult<'album'> | null> =>
            item && plugin
                ? plugin.methods.getArtistWorks(item, pageParam, 'album')
                : Promise.resolve(null),
        getNextPageParam: (last, all) =>
            last?.isEnd === false ? all.length + 1 : undefined,
        staleTime: 0,
    });

    const musicItems = useMemo(
        () => collectItems(musicQuery.data?.pages, EMPTY_MUSIC),
        [musicQuery.data],
    );
    const albumItems = useMemo(
        () => collectItems(albumQuery.data?.pages, EMPTY_ALBUM),
        [albumQuery.data],
    );

    const musicEvidence = evidenceOf(
        canLoad,
        musicQuery.data !== undefined,
        musicItems.length,
        musicQuery.hasNextPage,
        musicQuery.isLoadingError,
    );
    const albumEvidence = evidenceOf(
        albumEnabled,
        albumQuery.data !== undefined,
        albumItems.length,
        albumQuery.hasNextPage,
        albumQuery.isLoadingError,
    );

    // music 确认空 → 触发 album 探测
    const musicEmpty = musicEvidence === 'empty';
    useEffect(() => {
        if (musicEmpty) {
            setAlbumProbeRequested(true);
        }
    }, [musicEmpty]);

    // 仅专辑歌手：music 空且 album 有 → 默认落到专辑 tab（仅在仍停留 music 时切一次）
    const albumPresent = albumEvidence === 'present';
    useEffect(() => {
        if (musicEmpty && albumPresent) {
            setActiveType(prev => (prev === 'music' ? 'album' : prev));
        }
    }, [musicEmpty, albumPresent]);

    const visibleTypes = useMemo(
        () => deriveVisibleTypes(canLoad, musicEvidence, albumEvidence),
        [canLoad, musicEvidence, albumEvidence],
    );

    const pageState = useMemo(
        () =>
            derivePageState(
                pending,
                item != null,
                plugin != null,
                canGetWorks,
                visibleTypes.length,
                musicEvidence,
                albumEvidence,
            ),
        [
            pending,
            item,
            plugin,
            canGetWorks,
            visibleTypes.length,
            musicEvidence,
            albumEvidence,
        ],
    );

    // activeType 受 visibleTypes 约束，避免指向已隐藏的 tab
    const effectiveActiveType: ArtistMediaType =
        visibleTypes.length > 0 && !visibleTypes.includes(activeType)
            ? visibleTypes[0]!
            : activeType;

    const selectType = useCallback((type: ArtistMediaType) => {
        setActiveType(type);
    }, []);

    const profile = useMemo<ArtistProfile>(() => {
        const rawFans: unknown = item?.fans;
        const rawWorks: unknown = item?.worksNum;
        return {
            name: firstNonBlank(item?.name) ?? t('media.unknownArtist'),
            avatar: firstNonBlank(item?.avatar),
            fans:
                typeof rawFans === 'number' &&
                Number.isFinite(rawFans) &&
                rawFans >= 0
                    ? rawFans
                    : undefined,
            worksNum:
                typeof rawWorks === 'number' &&
                Number.isFinite(rawWorks) &&
                rawWorks >= 0
                    ? rawWorks
                    : undefined,
            description: firstNonBlank(item?.description),
        };
    }, [item, t]);

    // 解构稳定引用（useInfiniteQuery 顶层结果每渲染新 Proxy，不能整体作依赖）
    const { refetch: musicRefetch, fetchNextPage: musicFetchNextPage } =
        musicQuery;
    const { refetch: albumRefetch, fetchNextPage: albumFetchNextPage } =
        albumQuery;

    const musicRetry = useCallback(() => {
        musicRefetch().catch(() => {});
    }, [musicRefetch]);
    const musicLoadMore = useCallback(() => {
        // cancelRefetch:false —— 触底 / 重试快速重复触发时不打断进行中的取页
        musicFetchNextPage({ cancelRefetch: false }).catch(() => {});
    }, [musicFetchNextPage]);
    const albumRetry = useCallback(() => {
        albumRefetch().catch(() => {});
    }, [albumRefetch]);
    const albumLoadMore = useCallback(() => {
        albumFetchNextPage({ cancelRefetch: false }).catch(() => {});
    }, [albumFetchNextPage]);

    const music = useMemo<PaginatedArtistWorks<MusicItem>>(
        () => ({
            items: musicItems,
            isLoading: musicQuery.isLoading,
            isError: musicQuery.isLoadingError,
            retry: musicRetry,
            hasNextPage: musicQuery.hasNextPage,
            isFetchingNextPage: musicQuery.isFetchingNextPage,
            isFetchNextPageError: musicQuery.isFetchNextPageError,
            fetchNextPage: musicLoadMore,
        }),
        [
            musicItems,
            musicQuery.isLoading,
            musicQuery.isLoadingError,
            musicQuery.hasNextPage,
            musicQuery.isFetchingNextPage,
            musicQuery.isFetchNextPageError,
            musicRetry,
            musicLoadMore,
        ],
    );

    const album = useMemo<PaginatedArtistWorks<AlbumItemBase>>(
        () => ({
            items: albumItems,
            isLoading: albumQuery.isLoading,
            isError: albumQuery.isLoadingError,
            retry: albumRetry,
            hasNextPage: albumQuery.hasNextPage,
            isFetchingNextPage: albumQuery.isFetchingNextPage,
            isFetchNextPageError: albumQuery.isFetchNextPageError,
            fetchNextPage: albumLoadMore,
        }),
        [
            albumItems,
            albumQuery.isLoading,
            albumQuery.isLoadingError,
            albumQuery.hasNextPage,
            albumQuery.isFetchingNextPage,
            albumQuery.isFetchNextPageError,
            albumRetry,
            albumLoadMore,
        ],
    );

    return {
        pageState,
        profile,
        visibleTypes,
        activeType: effectiveActiveType,
        selectType,
        music,
        album,
    };
}
