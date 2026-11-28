import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/ui/Icon';
import { Image } from '@/components/ui/Image';
import { Text } from '@/components/ui/Text';
import { borderWidth, layout, radius, space, useColors } from '@/design';
import { useT } from '@/i18n';

import type { ArtistProfile } from '../hooks/useArtistDetailSource';

/** 侧栏内距（dp）：平板内容线；头像边长 = 栏宽 − 2×内距 */
const PANE_GUTTER = layout.gutter.tablet;
const AVATAR_SIZE = layout.detailPaneWidth - PANE_GUTTER * 2;
/** 兜底 user-round 直径：与沉浸头一致 */
const FALLBACK_ICON_SIZE = 76;

/**
 * 歌手详情·平板横屏左栏：头像 · 名字 · 事实 · 完整简介
 * 不随作品列表收起；栏内容超高时自身滚动。简介不截断
 */
export function ArtistSidePane({ profile }: { profile: ArtistProfile }) {
    const t = useT();
    const colors = useColors();
    const { name, avatar, fans, worksNum, description } = profile;
    const [failedAvatar, setFailedAvatar] = useState<string>();
    const showAvatarImage = avatar !== undefined && failedAvatar !== avatar;
    const facts = [
        fans != null ? t('artistDetail.fansCount', { count: fans }) : null,
        worksNum != null
            ? t('artistDetail.worksCount', { count: worksNum })
            : null,
    ]
        .filter(Boolean)
        .join(' · ');
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
                <View
                    style={[
                        styles.avatar,
                        { backgroundColor: colors.surfaceVariant },
                    ]}
                >
                    {showAvatarImage ? (
                        <Image
                            key={avatar}
                            source={avatar}
                            contentFit="cover"
                            style={StyleSheet.absoluteFill}
                            onError={() => setFailedAvatar(avatar)}
                        />
                    ) : (
                        <Icon
                            name="user-round"
                            size={FALLBACK_ICON_SIZE}
                            color="textSecondary"
                        />
                    )}
                </View>
                <Text
                    size="2xl"
                    weight="bold"
                    numberOfLines={3}
                    style={styles.name}
                    accessibilityRole="header"
                >
                    {name}
                </Text>
                {facts ? (
                    <Text size="md" color="textSecondary">
                        {facts}
                    </Text>
                ) : null}
                {description ? (
                    <Text size="sm" color="textSecondary">
                        {description}
                    </Text>
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
        gap: space.sm,
    },
    avatar: {
        width: AVATAR_SIZE,
        height: AVATAR_SIZE,
        borderRadius: radius.xl,
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
    },
    name: {
        marginTop: space.sm,
    },
});
