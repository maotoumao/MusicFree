import { ListItem } from '@/components/ui/ListItem';
import { MediaCover } from '@/components/ui/MediaCover';
import { Text } from '@/components/ui/Text';
import { layout } from '@/design';
import { useT } from '@/i18n';

import type { LocalPlaylist } from '@/core/playlist';

interface LocalPlaylistRowProps {
    item: LocalPlaylist;
    onPress?: () => void;
}

/**
 * 本地歌单行：封面缩略图（无则按 kind 回落图标）+ 名字 + 曲目数
 * 与 MediaRow 共用同一套列表密度和排版；收藏（远程）歌单走 MediaRow，那边是插件媒体、需要来源 Tag
 */
export function LocalPlaylistRow({ item, onPress }: LocalPlaylistRowProps) {
    const t = useT();

    const isFavorite = item.kind === 'favorite';
    // favorite 的 title 存空、由 UI 按 kind 本地化
    const title = isFavorite
        ? t('media.favoritePlaylist')
        : item.title.trim() || t('media.unknownTitle');
    const subtitle = t('media.songCount', { count: item.musicCount });

    return (
        <ListItem
            onPress={onPress}
            accessibilityLabel={`${title}，${subtitle}`}
            leading={
                <MediaCover
                    source={item.artwork}
                    fallbackIcon={isFavorite ? 'heart' : 'list-music'}
                    size={layout.mediaThumbnail}
                />
            }
            title={
                <Text size="md" numberOfLines={1}>
                    {title}
                </Text>
            }
            subtitle={
                <Text size="sm" color="textSecondary" numberOfLines={1}>
                    {subtitle}
                </Text>
            }
        />
    );
}
