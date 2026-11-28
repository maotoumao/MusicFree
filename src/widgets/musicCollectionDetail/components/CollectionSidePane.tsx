import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/ui/Icon';
import { Image } from '@/components/ui/Image';
import { MediaCover } from '@/components/ui/MediaCover';
import { Text } from '@/components/ui/Text';
import { borderWidth, layout, radius, space, useColors } from '@/design';
import { firstNonBlank } from '@/utils/text';
import { PlayAllBar } from '@/widgets/PlayAllBar';

import { StarButton } from './CollectionHeader';

import type {
    CollectionHeader as CollectionHeaderData,
    CollectionStarCapability,
} from '../types';
import type { MusicItem } from '@/types';

/** 侧栏内距（dp）：平板内容线；封面边长 = 栏宽 − 2×内距 */
const PANE_GUTTER = layout.gutter.tablet;
const COVER_SIZE = layout.detailPaneWidth - PANE_GUTTER * 2;

interface CollectionSidePaneProps {
    header: CollectionHeaderData;
    star?: CollectionStarCapability;
    /** 编辑不可用的原因（只读 banner），有则显示在动作条上方 */
    banner?: string;
    /** 有曲目才渲染播放条 */
    musicList: readonly MusicItem[];
    onSort?(): void;
    onMultiSelect?(): void;
    sortDisabled?: boolean;
}

/**
 * 集合详情·平板横屏左栏：封面 · 标题 · 创建者 / 事实 · 完整简介 · 播放条
 *
 * 不随列表滚动收起（横屏没有可收起的纵向空间），封面与「播放全部」始终可见；
 * 栏内容超高时自身滚动。简介不截断——这一栏就是给它地方的。
 */
export function CollectionSidePane({
    header,
    star,
    banner,
    musicList,
    onSort,
    onMultiSelect,
    sortDisabled,
}: CollectionSidePaneProps) {
    const colors = useColors();
    const { artwork, fallbackIcon, title, description, creator, details } =
        header;
    const [failedAvatar, setFailedAvatar] = useState<string>();
    const avatarFailed =
        creator?.avatar !== undefined && failedAvatar === creator.avatar;
    return (
        <View
            style={[
                styles.pane,
                {
                    backgroundColor: colors.surface,
                    borderRightColor: colors.border,
                },
            ]}
        >
            <ScrollView
                contentContainerStyle={styles.content}
                showsVerticalScrollIndicator={false}
            >
                <MediaCover
                    source={firstNonBlank(artwork)}
                    fallbackIcon={fallbackIcon}
                    size={COVER_SIZE}
                    radius={radius.xl}
                />
                <View style={styles.titleRow}>
                    <Text
                        size="2xl"
                        weight="bold"
                        numberOfLines={3}
                        style={styles.title}
                        accessibilityRole="header"
                    >
                        {title}
                    </Text>
                    {star ? <StarButton star={star} /> : null}
                </View>
                {creator || details.length > 0 ? (
                    <View style={styles.meta}>
                        {creator ? (
                            <View style={styles.creatorRow}>
                                {creator.avatar && !avatarFailed ? (
                                    <Image
                                        key={creator.avatar}
                                        source={creator.avatar}
                                        style={[
                                            styles.avatar,
                                            {
                                                backgroundColor:
                                                    colors.surfaceVariant,
                                            },
                                        ]}
                                        onError={() =>
                                            setFailedAvatar(creator.avatar)
                                        }
                                    />
                                ) : creator.avatar ? (
                                    <View
                                        style={[
                                            styles.avatar,
                                            styles.avatarFallback,
                                            {
                                                backgroundColor:
                                                    colors.surfaceVariant,
                                            },
                                        ]}
                                    >
                                        <Icon
                                            name="user-round"
                                            size="sm"
                                            color="textSecondary"
                                        />
                                    </View>
                                ) : null}
                                <Text
                                    size="md"
                                    color="textSecondary"
                                    numberOfLines={1}
                                    style={styles.creatorName}
                                >
                                    {creator.name}
                                </Text>
                            </View>
                        ) : null}
                        {details.length > 0 ? (
                            <Text size="md" color="textSecondary">
                                {details.join(' · ')}
                            </Text>
                        ) : null}
                    </View>
                ) : null}
                {description ? (
                    <Text size="sm" color="textSecondary">
                        {description}
                    </Text>
                ) : null}
                {banner ? (
                    <Text size="sm" color="warning" style={styles.banner}>
                        {banner}
                    </Text>
                ) : null}
                {musicList.length > 0 ? (
                    // PlayAllBar 自带手机内容线（16 + 贴边图标外推），在栏内距里再缩一次会太深：负外距抵掉栏内距的差额
                    <View style={styles.playAll}>
                        <PlayAllBar
                            musicList={musicList}
                            onSort={onSort}
                            onMultiSelect={onMultiSelect}
                            sortDisabled={sortDisabled}
                        />
                    </View>
                ) : null}
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    pane: {
        width: layout.detailPaneWidth,
        borderRightWidth: borderWidth.hairline,
    },
    content: {
        padding: PANE_GUTTER,
        paddingTop: space.xl,
        gap: space.md,
    },
    titleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.sm,
        marginTop: space.sm,
    },
    title: {
        flex: 1,
    },
    meta: {
        gap: space.xs,
    },
    creatorRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.sm,
    },
    avatar: {
        width: 22,
        height: 22,
        borderRadius: radius.full,
    },
    avatarFallback: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    creatorName: {
        flexShrink: 1,
    },
    banner: {
        marginTop: space.xs,
    },
    playAll: {
        marginTop: space.sm,
        marginHorizontal: layout.gutter.compact - PANE_GUTTER,
    },
});
