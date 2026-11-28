import { FlashList } from '@shopify/flash-list';
import { useCallback, useMemo } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { usePressAnimation } from '@/components/hooks/usePressAnimation';
import { ContentUnavailable } from '@/components/ui/ContentUnavailable';
import { Text } from '@/components/ui/Text';
import { useLocalCollections } from '@/core/localMusic';
import { space } from '@/design';
import {
    gridColumnsForAvailable,
    useGridColumns,
} from '@/hooks/useGridColumns';
import { useT } from '@/i18n';
import { firstNonBlank } from '@/utils/text';

import { CollectionCover } from './CollectionCover';

import type { LocalCollection, LocalCollectionView } from '@/core/localMusic';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** view='albums' 派生项恒为 album（core deriveCollections 保证） */
type AlbumCollection = Extract<LocalCollection, { kind: 'album' }>;

/** 单个专辑格：方形封面（缺则唱片图标占位）+ 专辑名 + 艺术家（自订阅 useT，切语言即更新） */
function AlbumCell({
    item,
    onOpen,
}: {
    item: AlbumCollection;
    onOpen: (view: LocalCollectionView, key: string, title: string) => void;
}) {
    const t = useT();
    const { animatedStyle, onPressIn, onPressOut } = usePressAnimation(0.96);
    // album/albumArtist 允许空串（无标签音频）；展示与导航标题回退，查询仍用原始 key
    const album = firstNonBlank(item.album) ?? t('media.unknownAlbum');
    const artist = firstNonBlank(item.albumArtist) ?? t('media.unknownArtist');
    return (
        <AnimatedPressable
            onPress={() => onOpen('albums', item.key, album)}
            onPressIn={onPressIn}
            onPressOut={onPressOut}
            accessibilityRole="button"
            accessibilityLabel={`${t('localMusic.collections.a11y.album', {
                name: album,
                artist,
            })} ${t('media.songCount', { count: item.count })}`}
            style={[styles.cell, animatedStyle]}
        >
            <CollectionCover coverRef={item.coverRef} fallbackIcon="disc-3" />
            <Text
                size="md"
                weight="medium"
                numberOfLines={2}
                style={styles.title}
            >
                {album}
            </Text>
            <Text size="sm" color="textSecondary" numberOfLines={1}>
                {artist}
            </Text>
        </AnimatedPressable>
    );
}

/** 专辑概览：两列紧凑封面网格；点专辑进详情（onOpen 由容器注入） */
/** 封面格的理想格宽：手机上算出来恰好是两列 */
const COVER_IDEAL_WIDTH = 200;

export function AlbumsView({
    onOpen,
    availableWidth,
}: {
    onOpen: (view: LocalCollectionView, key: string, title: string) => void;
    /**
     * 本视图实际可用的宽度（dp）；横屏分栏时由容器传入定宽栏的宽度
     *
     * 不传 = 回落窗口宽（竖屏单列，与适配前一致）。分栏下必须传：`useGridColumns` 读的是
     * **窗口宽**，在 280~460dp 的集合列里会按整窗算出 4~6 列，封面被压到 48~63dp
     */
    availableWidth?: number;
}) {
    const t = useT();
    const insets = useSafeAreaInsets();
    const albums = useLocalCollections('albums');
    // 等权封面格：宽屏加列铺满，手机上算出来仍是两列
    const windowColumns = useGridColumns(COVER_IDEAL_WIDTH);
    const columns =
        availableWidth === undefined
            ? windowColumns
            : gridColumnsForAvailable(
                  availableWidth - space.sm * 2,
                  COVER_IDEAL_WIDTH,
              );

    // 空态撑满 viewport 以居中 ContentUnavailable；有内容时正常流式布局
    const contentStyle = useMemo(
        () => ({
            padding: space.sm,
            paddingBottom: insets.bottom,
            ...(albums.length === 0 ? { flexGrow: 1 } : null),
        }),
        [insets.bottom, albums.length],
    );

    const renderItem = useCallback(
        ({ item }: { item: AlbumCollection }) => (
            <AlbumCell item={item} onOpen={onOpen} />
        ),
        [onOpen],
    );

    return (
        <FlashList
            data={albums}
            numColumns={columns}
            renderItem={renderItem}
            keyExtractor={a => a.key}
            contentContainerStyle={contentStyle}
            ListEmptyComponent={
                <ContentUnavailable
                    icon="inbox"
                    title={t('localMusic.empty.title')}
                    description={t('localMusic.empty.description')}
                />
            }
        />
    );
}

const styles = StyleSheet.create({
    cell: {
        flex: 1,
        paddingHorizontal: space.sm,
        paddingBottom: space.lg,
        gap: space.xs,
    },
    // 标题固定两行高度：numColumns 网格要求 item 等高，避免一行/两行标题混排的测量抖动
    title: {
        minHeight: 40,
    },
});
