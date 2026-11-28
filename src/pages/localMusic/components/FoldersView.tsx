import { useCallback, useMemo } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ListItem } from '@/components/ui/ListItem';
import { MediaList } from '@/components/ui/MediaList';
import { Text } from '@/components/ui/Text';
import { useLocalCollections } from '@/core/localMusic';
import { useT } from '@/i18n';

import { CollectionCover } from './CollectionCover';

import type { LocalCollection, LocalCollectionView } from '@/core/localMusic';

/** view='folders' 派生项恒为 folder（core deriveCollections 保证） */
type FolderCollection = Extract<LocalCollection, { kind: 'folder' }>;

/** 文件夹行：独立组件（自订阅 useT，切语言时 FlashList 已渲染行也随之更新） */
function FolderRow({
    item,
    onOpen,
}: {
    item: FolderCollection;
    onOpen: (view: LocalCollectionView, key: string, title: string) => void;
}) {
    const t = useT();
    return (
        <ListItem
            leading={
                <CollectionCover
                    coverRef={item.coverRef}
                    fallbackIcon="folder-open"
                    size={44}
                />
            }
            title={<Text numberOfLines={1}>{item.name}</Text>}
            subtitle={
                <Text size="sm" color="textSecondary" numberOfLines={1}>
                    {t('media.songCount', { count: item.count })}
                </Text>
            }
            onPress={() => onOpen('folders', item.path, item.name)}
            accessibilityLabel={`${t('localMusic.collections.a11y.folder', {
                name: item.name,
            })} ${t('media.songCount', { count: item.count })}`}
        />
    );
}

/** 文件夹概览：文件夹图标 + 名称 + 曲数；点集合进详情（onOpen 由容器注入） */
export function FoldersView({
    onOpen,
    inPane = false,
}: {
    onOpen: (view: LocalCollectionView, key: string, title: string) => void;
    /** 横屏分栏下行已被定宽栏约束：限宽不再按窗口宽套手机档的 640 */
    inPane?: boolean;
}) {
    const t = useT();
    const insets = useSafeAreaInsets();
    const folders = useLocalCollections('folders');

    const contentStyle = useMemo(
        () => ({ paddingBottom: insets.bottom }),
        [insets.bottom],
    );

    const renderItem = useCallback(
        ({ item }: { item: FolderCollection }) => (
            <FolderRow item={item} onOpen={onOpen} />
        ),
        [onOpen],
    );

    return (
        <MediaList
            inPane={inPane}
            data={folders}
            renderItem={renderItem}
            keyExtractor={f => f.path}
            contentContainerStyle={contentStyle}
            empty={{
                icon: 'inbox',
                title: t('localMusic.empty.title'),
                description: t('localMusic.empty.description'),
            }}
        />
    );
}
