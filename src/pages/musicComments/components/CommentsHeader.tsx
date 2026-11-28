import { StyleSheet, View } from 'react-native';

import { MediaCover } from '@/components/ui/MediaCover';
import { Text } from '@/components/ui/Text';
import { borderWidth, layout, radius, space, useColors } from '@/design';
import { useT } from '@/i18n';

import type { MusicItem } from '@/types';

/** 头部封面边长：比列表缩略图大一档，让头部像有意为之的区域而非挤出来的一条 */
const COVER_SIZE = 56;

/** 评论页顶部的归属信息条：说明「在看哪首歌的评论」，不可点、不入焦点序列 */
export function CommentsHeader({ item }: { item: MusicItem }) {
    const t = useT();
    const colors = useColors();
    const artist = typeof item.artist === 'string' ? item.artist.trim() : '';
    return (
        <View
            style={[styles.header, { borderBottomColor: colors.border }]}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
        >
            <MediaCover
                source={item.artwork}
                fallbackIcon="disc-3"
                size={COVER_SIZE}
                radius={radius.md}
            />
            <View style={styles.text}>
                <Text size="md" weight="bold" numberOfLines={1}>
                    {item.title}
                </Text>
                <Text size="sm" color="textSecondary" numberOfLines={1}>
                    {artist || t('media.unknownArtist')}
                </Text>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.md,
        paddingHorizontal: layout.screenGutter,
        paddingVertical: space.lg,
        borderBottomWidth: borderWidth.hairline,
    },
    text: {
        flex: 1,
        gap: space.xs,
    },
});
