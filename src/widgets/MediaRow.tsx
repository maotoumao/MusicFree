import { StyleSheet, View } from 'react-native';

import { Box } from '@/components/ui/Box';
import { ListItem } from '@/components/ui/ListItem';
import { MediaCover } from '@/components/ui/MediaCover';
import { Tag } from '@/components/ui/Tag';
import { Text } from '@/components/ui/Text';
import { layout } from '@/design';
import { useT } from '@/i18n';
import { firstNonBlank } from '@/utils/text';

import type { AlbumItemBase, ArtistItem, PlaylistItemBase } from '@/types';

type MediaRowProps =
    | { type: 'album'; item: AlbumItemBase; onPress: () => void }
    | { type: 'artist'; item: ArtistItem; onPress: () => void }
    | { type: 'playlist'; item: PlaylistItemBase; onPress: () => void };

/** 类型 → a11y 前缀文案 key（媒体类型词汇既有） */
const TYPE_LABEL_KEY = {
    album: 'media.type.album',
    artist: 'media.type.artist',
    playlist: 'media.type.playlist',
} as const;

/**
 * 专辑 / 歌手 / 歌单行：封面缩略图 + 标题 + 平台 Tag + 副标题，点击导航
 * 按 type 分派封面形状（歌手圆、专辑 / 歌单方）与缺图兜底（专辑 disc-3、歌手 user-round、歌单 list-music）
 * 不 player-aware、不 import core；点击行为由调用方经 onPress 注入
 */
export function MediaRow(props: MediaRowProps) {
    const { type, onPress } = props;
    const t = useT();

    const songCount = (n?: number): string | undefined =>
        n != null ? t('media.songCount', { count: n }) : undefined;

    // 各类型的封面候选 / 标题 / 副标题字段映射
    // TODO 副标题的粉丝数 / 播放量待接真实数据 + 本地化紧凑数字后再补
    let coverCandidates: (string | undefined)[];
    let title: string;
    let subtitleParts: (string | undefined)[];
    if (props.type === 'album') {
        coverCandidates = [props.item.artwork];
        title = props.item.title;
        subtitleParts = [props.item.artist, songCount(props.item.worksNum)];
    } else if (props.type === 'artist') {
        coverCandidates = [props.item.avatar];
        title = props.item.name;
        subtitleParts = [songCount(props.item.worksNum)];
    } else {
        coverCandidates = [props.item.artwork, props.item.coverImg];
        // 插件返回不可信：标题 / 歌手可能是非字符串或全空白，洗净后再回落
        title = firstNonBlank(props.item.title) ?? t('media.unknownTitle');
        subtitleParts = [
            firstNonBlank(props.item.artist),
            songCount(props.item.worksNum),
        ];
    }

    // 取首个 trim 后非空的封面来源；空串 / 空白视作无封面
    const coverUri = coverCandidates
        .map(s => s?.trim())
        .find((s): s is string => s != null && s.length > 0);

    const subtitle = subtitleParts.filter(Boolean).join(' · ');
    const a11yLabel = [
        t(TYPE_LABEL_KEY[type]),
        title,
        subtitle,
        props.item.platform,
    ]
        .filter(Boolean)
        .join('，');

    return (
        <ListItem
            leading={
                <MediaCover
                    source={coverUri}
                    fallbackIcon={
                        type === 'album'
                            ? 'disc-3'
                            : type === 'artist'
                            ? 'user-round'
                            : 'list-music'
                    }
                    round={type === 'artist'}
                    size={layout.mediaThumbnail}
                />
            }
            title={
                <Box row align="center" gap="xs">
                    <Text size="md" numberOfLines={1} style={styles.title}>
                        {title}
                    </Text>
                    <View style={styles.tagSlot}>
                        <Tag label={props.item.platform} />
                    </View>
                </Box>
            }
            subtitle={
                subtitle ? (
                    <Text size="xs" color="textSecondary" numberOfLines={1}>
                        {subtitle}
                    </Text>
                ) : undefined
            }
            accessibilityLabel={a11yLabel}
            onPress={onPress}
        />
    );
}

const styles = StyleSheet.create({
    title: {
        flex: 1,
        minWidth: 0,
    },
    tagSlot: {
        maxWidth: '33%',
        flexShrink: 1,
    },
});
