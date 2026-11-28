import { useNavigation } from '@react-navigation/native';
import { type FlashListProps } from '@shopify/flash-list';
import { useCallback } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { MediaCard } from '@/components/ui/MediaCard';
import { MediaList } from '@/components/ui/MediaList';
import { layout, space } from '@/design';
import {
    gridColumnsForAvailable,
    useGridColumns,
} from '@/hooks/useGridColumns';
import { useT } from '@/i18n';
import { stash } from '@/infra/stash';
import { mediaKey } from '@/utils/media';

import type { PaginatedArtistWorks } from '../hooks/useArtistDetailSource';
import type { AlbumItemBase } from '@/types';

/**
 * 歌手专辑网格：MediaList 两列 + MediaCard fill；点按进插件专辑详情
 * 专辑 DTO 含插件私有字段、不可靠序列化，故存 stash 只传 ticket（同搜索 / 歌单入口）
 */
/** 封面格的理想格宽：手机上算出来恰好是两列 */
const COVER_IDEAL_WIDTH = 200;

export function ArtistAlbumGrid({
    works,
    onScroll,
    contentContainerStyle,
    availableWidth,
}: {
    works: PaginatedArtistWorks<AlbumItemBase>;
    onScroll: FlashListProps<AlbumItemBase>['onScroll'];
    contentContainerStyle: StyleProp<ViewStyle>;
    /** 网格实际可用宽（dp）：横屏分栏时网格不再占整窗，列数得按栏宽算；不传 = 按窗口宽（手机路径） */
    availableWidth?: number;
}) {
    // 等权封面格：宽屏加列铺满，手机上算出来仍是两列
    const windowColumns = useGridColumns(COVER_IDEAL_WIDTH);
    const columns =
        availableWidth === undefined || availableWidth <= 0
            ? windowColumns
            : gridColumnsForAvailable(
                  availableWidth - layout.gutter.tablet * 2,
                  COVER_IDEAL_WIDTH,
              );

    const t = useT();
    const navigation = useNavigation();

    const openAlbum = useCallback(
        (album: AlbumItemBase) => {
            const ticket = stash(album);
            navigation.navigate('PluginAlbumDetail', { ticket });
        },
        [navigation],
    );

    const renderItem = useCallback(
        ({ item }: { item: AlbumItemBase; index: number }) => (
            <View style={styles.cell}>
                <MediaCard
                    source={item.artwork}
                    fallbackIcon="disc-3"
                    title={item.title}
                    fill
                    onPress={() => openAlbum(item)}
                />
            </View>
        ),
        [openAlbum],
    );

    return (
        <MediaList
            numColumns={columns}
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
                    : { icon: 'inbox', title: t('artistDetail.empty.album') }
            }
            onScroll={onScroll}
            contentContainerStyle={contentContainerStyle}
        />
    );
}

const styles = StyleSheet.create({
    // 两列格：cell 自带水平/底部留白 → 列间距与行间距（MediaCard 本身无外边距）
    cell: {
        flex: 1,
        paddingHorizontal: space.sm,
        paddingBottom: space.lg,
    },
});
