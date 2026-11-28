import { useCallback, useMemo } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ListItem } from '@/components/ui/ListItem';
import { MediaList } from '@/components/ui/MediaList';
import { Text } from '@/components/ui/Text';
import { useLocalCollections } from '@/core/localMusic';
import { useT } from '@/i18n';
import { firstNonBlank } from '@/utils/text';

import { CollectionCover } from './CollectionCover';

import type { LocalCollection, LocalCollectionView } from '@/core/localMusic';

/** view='artists' 派生项恒为 artist（core deriveCollections 保证） */
type ArtistCollection = Extract<LocalCollection, { kind: 'artist' }>;

/** 艺术家行：独立组件（自订阅 useT，切语言时 FlashList 已渲染行也随之更新） */
function ArtistRow({
    item,
    onOpen,
}: {
    item: ArtistCollection;
    onOpen: (view: LocalCollectionView, key: string, title: string) => void;
}) {
    const t = useT();
    // artist 允许空串（无标签音频）；展示与导航标题回退「未知歌手」，查询仍用原始 key
    const name = firstNonBlank(item.artist) ?? t('media.unknownArtist');
    return (
        <ListItem
            leading={
                <CollectionCover
                    coverRef={item.coverRef}
                    fallbackIcon="user-round"
                    size={44}
                    round
                />
            }
            title={<Text numberOfLines={1}>{name}</Text>}
            subtitle={
                <Text size="sm" color="textSecondary" numberOfLines={1}>
                    {`${t('localMusic.collections.albumCount', {
                        count: item.albumCount,
                    })} · ${t('media.songCount', { count: item.count })}`}
                </Text>
            }
            onPress={() => onOpen('artists', item.artist, name)}
            accessibilityLabel={`${t('localMusic.collections.a11y.artist', {
                name,
            })} ${t('localMusic.collections.albumCount', {
                count: item.albumCount,
            })} ${t('media.songCount', { count: item.count })}`}
        />
    );
}

/** 艺术家概览：圆形封面 + 名称 + 专辑数·曲数；点集合进详情（onOpen 由容器注入） */
export function ArtistsView({
    onOpen,
    inPane = false,
}: {
    onOpen: (view: LocalCollectionView, key: string, title: string) => void;
    /** 横屏分栏下行已被定宽栏约束：限宽不再按窗口宽套手机档的 640 */
    inPane?: boolean;
}) {
    const t = useT();
    const insets = useSafeAreaInsets();
    const artists = useLocalCollections('artists');

    const contentStyle = useMemo(
        () => ({ paddingBottom: insets.bottom }),
        [insets.bottom],
    );

    const renderItem = useCallback(
        ({ item }: { item: ArtistCollection }) => (
            <ArtistRow item={item} onOpen={onOpen} />
        ),
        [onOpen],
    );

    return (
        <MediaList
            inPane={inPane}
            data={artists}
            renderItem={renderItem}
            keyExtractor={a => a.artist}
            contentContainerStyle={contentStyle}
            empty={{
                icon: 'inbox',
                title: t('localMusic.empty.title'),
                description: t('localMusic.empty.description'),
            }}
        />
    );
}
