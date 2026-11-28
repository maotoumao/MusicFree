import { type FlashListProps } from '@shopify/flash-list';
import { useCallback, useLayoutEffect, useRef } from 'react';
import { type StyleProp, type ViewStyle } from 'react-native';

import { MediaList } from '@/components/ui/MediaList';
import { player } from '@/core/player';
import { useT } from '@/i18n';
import { mediaKey } from '@/utils/media';
import { MusicRow } from '@/widgets/MusicRow';
import { showMusicItemOptionsPanel } from '@/widgets/overlays/MusicItemOptionsPanel';

import type { PaginatedArtistWorks } from '../hooks/useArtistDetailSource';
import type { MusicItem } from '@/types';

/**
 * 歌手单曲列表：MediaList + MusicRow；点按播放（换队列为当前已加载单曲）、更多开选项面板
 * 封面 + Tabs 占位由 scaffold 经 listHeader 注入，随本列表滚动收起
 */
export function ArtistMusicList({
    works,
    onScroll,
    contentContainerStyle,
}: {
    works: PaginatedArtistWorks<MusicItem>;
    onScroll: FlashListProps<MusicItem>['onScroll'];
    contentContainerStyle: StyleProp<ViewStyle>;
}) {
    const t = useT();
    // items 存 ref：playFrom 保持稳定，翻页追加时已有行不重渲染（同搜索 / 集合详情做法）
    const itemsRef = useRef(works.items);
    useLayoutEffect(() => {
        itemsRef.current = works.items;
    }, [works.items]);

    const playFrom = useCallback((item: MusicItem) => {
        // 换队列只用当前已加载的歌手单曲；fire-and-forget，错误由 core/player 恢复
        player.replaceQueueAndPlay(item, [...itemsRef.current]).catch(() => {});
    }, []);
    const openMenu = useCallback((item: MusicItem) => {
        showMusicItemOptionsPanel({ item, source: { kind: 'generic' } });
    }, []);

    const renderItem = useCallback(
        ({ item, index }: { item: MusicItem; index: number }) => (
            <MusicRow
                item={item}
                position={index + 1}
                onPress={playFrom}
                onMore={openMenu}
            />
        ),
        [playFrom, openMenu],
    );

    return (
        <MediaList
            data={works.items}
            renderItem={renderItem}
            keyExtractor={mediaKey}
            isLoading={works.isLoading}
            hasNextPage={works.hasNextPage}
            isFetchingNextPage={works.isFetchingNextPage}
            isFetchNextPageError={works.isFetchNextPageError}
            onEndReached={works.fetchNextPage}
            onRetryNextPage={works.fetchNextPage}
            empty={
                works.isError
                    ? {
                          icon: 'triangle-alert',
                          title: t('feedback.loadFailed'),
                          action: {
                              label: t('common.retry'),
                              onPress: works.retry,
                          },
                      }
                    : { icon: 'inbox', title: t('artistDetail.empty.music') }
            }
            onScroll={onScroll}
            contentContainerStyle={contentContainerStyle}
        />
    );
}
