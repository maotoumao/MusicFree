import { ScrollView, StyleSheet, View } from 'react-native';

import { definePanel } from '@/components/overlay';
import { IconButton, iconButtonEdgeInset } from '@/components/ui/IconButton';
import { Text } from '@/components/ui/Text';
import { layout, space } from '@/design';
import { useT } from '@/i18n';

import type { OverlayProps } from '@/components/overlay';

export interface MediaDescriptionInput {
    /** 面板头标题（标识来源：歌单 / 专辑 / 歌手名等） */
    title: string;
    /** 完整描述（可滚） */
    description: string;
}

/** 媒体简介面板：只读、可滚长描述；关闭按钮 + backdrop / 返回键关闭。歌单 / 专辑 / 歌手等共用 */
function MediaDescriptionPanelView({
    payload,
    close,
}: OverlayProps<MediaDescriptionInput>) {
    const { title, description } = payload;
    const t = useT();
    return (
        <View style={styles.root}>
            <View style={styles.header}>
                <Text
                    size="xl"
                    weight="bold"
                    numberOfLines={2}
                    accessibilityRole="header"
                    style={styles.title}
                >
                    {title}
                </Text>
                <IconButton
                    icon="x"
                    tone="textSecondary"
                    onPress={() => close()}
                    accessibilityLabel={t('common.close')}
                />
            </View>
            <ScrollView
                style={styles.body}
                contentContainerStyle={styles.content}
            >
                <Text size="md" color="textSecondary" lineHeight="normal">
                    {description}
                </Text>
            </ScrollView>
        </View>
    );
}

/** 打开媒体简介面板 */
export const showMediaDescriptionPanel = definePanel(MediaDescriptionPanelView);

const styles = StyleSheet.create({
    root: {
        flexGrow: 1,
        flexShrink: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingLeft: layout.screenGutter,
        /** 右端是贴边关闭按钮，外推后图标本体落回内容线 */
        paddingRight: iconButtonEdgeInset(layout.screenGutter),
        marginBottom: space.sm,
    },
    title: {
        flex: 1,
        marginRight: space.sm,
    },
    body: {
        flexGrow: 1,
        flexShrink: 1,
    },
    content: {
        paddingHorizontal: space.lg,
        paddingBottom: space.lg,
    },
});
