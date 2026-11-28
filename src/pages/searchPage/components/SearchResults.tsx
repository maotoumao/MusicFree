import { useNavigation } from '@react-navigation/native';
import { memo, useCallback, useLayoutEffect, useRef } from 'react';

import { MediaList } from '@/components/ui/MediaList';
import { config } from '@/core/config';
import { player } from '@/core/player';
import { useT } from '@/i18n';
import { stash } from '@/infra/stash';
import { mediaKey } from '@/utils/media';
import { MediaRow } from '@/widgets/MediaRow';
import { MusicRow } from '@/widgets/MusicRow';
import { showMusicItemOptionsPanel } from '@/widgets/overlays/MusicItemOptionsPanel';

import { useSearchResults } from '../hooks/useSearchResults';

import type { SearchType } from '../lib/searchTypes';
import type { Plugin } from '@/core/plugin';
import type {
    AlbumItemBase,
    ArtistItem,
    MediaItemByType,
    MusicItem,
    PlaylistItemBase,
} from '@/types';

/**
 * 结果 scene：单一 (来源, 类型, query) 的结果列表 + 状态；来源由调用方注入
 * 行按类型分派——music 用 MusicRow（点按播放），album/artist/playlist 用 MediaRow
 * search(type) 契约保证 item 即该 type 的媒体，故 renderItem 按 type 收窄 cast 安全
 */
export const SearchResults = memo(function SearchResultsView({
    source,
    type,
    query,
}: {
    source: Plugin;
    type: SearchType;
    query: string;
}) {
    const t = useT();
    const navigation = useNavigation();
    const {
        items,
        isLoading,
        isError,
        isRefetching,
        refresh,
        hasNextPage,
        isFetchingNextPage,
        isFetchNextPageError,
        fetchNextPage,
    } = useSearchResults(source, type, query);

    // items 存 ref：handlePlay 仅依赖 clickBehavior 保持稳定，翻页追加时已有行不重渲染
    const itemsRef = useRef(items);
    useLayoutEffect(() => {
        itemsRef.current = items;
    }, [items]);
    const handlePlay = useCallback((item: MusicItem) => {
        // 仅 music 类型触发（renderItem 类型门控），此时 items 即 MusicItem[]
        // 换队列只用当前来源已加载的单曲，绝不混源；fire-and-forget，错误由 core/player onError 恢复
        const clickBehavior = config.get('basic.clickMusicInSearch');
        if (clickBehavior === 'playMusicAndReplace') {
            player
                .replaceQueueAndPlay(item, itemsRef.current as MusicItem[])
                .catch(() => {});
        } else {
            player.play(item).catch(() => {});
        }
    }, []);

    // 歌手结果 → 插件歌手详情页：同歌单入口（DTO 存 stash、只传 ticket）
    const openArtist = useCallback(
        (artistItem: ArtistItem) => {
            const ticket = stash(artistItem);
            navigation.navigate('ArtistDetail', { ticket });
        },
        [navigation],
    );

    // 歌单结果 → 插件歌单详情页：DTO 存 stash、只传 ticket（PlaylistItemBase 含插件私有字段、不可靠序列化）
    const openPlaylist = useCallback(
        (playlistItem: PlaylistItemBase) => {
            const ticket = stash(playlistItem);
            navigation.navigate('PluginPlaylistDetail', { ticket });
        },
        [navigation],
    );

    // 专辑结果 → 插件专辑详情页：同歌单入口（DTO 存 stash、只传 ticket）
    const openAlbum = useCallback(
        (albumItem: AlbumItemBase) => {
            const ticket = stash(albumItem);
            navigation.navigate('PluginAlbumDetail', { ticket });
        },
        [navigation],
    );

    const openItemMenu = useCallback((item: MusicItem) => {
        showMusicItemOptionsPanel({
            item,
            source: { kind: 'generic' },
        });
    }, []);

    const renderItem = useCallback(
        ({ item }: { item: MediaItemByType[SearchType]; index: number }) => {
            switch (type) {
                case 'music':
                    return (
                        <MusicRow
                            item={item as MusicItem}
                            onPress={handlePlay}
                            onMore={openItemMenu}
                        />
                    );
                case 'album':
                    return (
                        <MediaRow
                            type="album"
                            item={item as AlbumItemBase}
                            onPress={() => openAlbum(item as AlbumItemBase)}
                        />
                    );
                case 'artist':
                    return (
                        <MediaRow
                            type="artist"
                            item={item as ArtistItem}
                            onPress={() => openArtist(item as ArtistItem)}
                        />
                    );
                case 'playlist':
                    return (
                        <MediaRow
                            type="playlist"
                            item={item as PlaylistItemBase}
                            onPress={() =>
                                openPlaylist(item as PlaylistItemBase)
                            }
                        />
                    );
            }
        },
        [type, handlePlay, openArtist, openAlbum, openPlaylist, openItemMenu],
    );

    const loadMore = useCallback(() => {
        // cancelRefetch:false —— 在途翻页时忽略重复触发（触底 / 重试连点），不取消重启在途请求
        fetchNextPage({ cancelRefetch: false }).catch(() => {});
    }, [fetchNextPage]);

    return (
        <MediaList
            data={items}
            renderItem={renderItem}
            keyExtractor={mediaKey}
            isLoading={isLoading}
            isRefreshing={isRefetching}
            onRefresh={refresh}
            hasNextPage={hasNextPage}
            isFetchingNextPage={isFetchingNextPage}
            onEndReached={loadMore}
            isFetchNextPageError={isFetchNextPageError}
            onRetryNextPage={loadMore}
            empty={
                isError
                    ? {
                          icon: 'search',
                          title: t('feedback.loadFailed'),
                          action: {
                              label: t('common.retry'),
                              onPress: refresh,
                          },
                      }
                    : { icon: 'search', title: t('search.noResults') }
            }
        />
    );
});
