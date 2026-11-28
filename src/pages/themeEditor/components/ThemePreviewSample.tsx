import { StyleSheet, View } from 'react-native';

import { Icon } from '@/components/ui/Icon';
import { Text } from '@/components/ui/Text';
import { borderWidth, layout, radius, space, useColors } from '@/design';
import { useT } from '@/i18n';

/**
 * 压在背景上的组件样张：卡片 / 列表行 / 迷你播放条各一，全部用真实 UI 原子搭
 *
 * 编辑器把正在编辑的主题投影为全局主题，这些原子读的就是它的语义色，
 * 于是样张不需要任何传色参数，天然与真实界面一致。装饰性内容，不进无障碍树。
 */
function ThemePreviewSample() {
    const colors = useColors();
    const t = useT();
    return (
        <View
            style={styles.root}
            pointerEvents="none"
            importantForAccessibility="no-hide-descendants"
            accessibilityElementsHidden
        >
            <View style={[styles.card, { backgroundColor: colors.surface }]}>
                <Icon name="list-music" size="md" color="primary" />
                <Text size="md" weight="bold">
                    {t('themeEditor.sample.card')}
                </Text>
            </View>
            <View style={styles.row}>
                <View
                    style={[
                        styles.cover,
                        { backgroundColor: colors.surfaceVariant },
                    ]}
                />
                <View style={styles.rowText}>
                    <Text size="md" numberOfLines={1}>
                        {t('themeEditor.sample.title')}
                    </Text>
                    <Text size="sm" color="textSecondary" numberOfLines={1}>
                        {t('themeEditor.sample.artist')}
                    </Text>
                </View>
            </View>
            <View
                style={[
                    styles.bar,
                    {
                        backgroundColor: colors.surface,
                        borderTopColor: colors.border,
                    },
                ]}
            >
                <View
                    style={[
                        styles.cover,
                        { backgroundColor: colors.surfaceVariant },
                    ]}
                />
                <View style={styles.rowText}>
                    <Text size="sm" numberOfLines={1}>
                        {t('themeEditor.sample.playing')}
                    </Text>
                </View>
                <Icon name="play" size="md" color="primary" />
            </View>
        </View>
    );
}

const COVER = 36;

const styles = StyleSheet.create({
    root: {
        paddingHorizontal: layout.screenGutter,
        // 三块之间用 lg 而非块内的 sm：它们是并列的样品，不是一个组件的内部结构
        gap: space.lg,
    },
    card: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.sm,
        paddingHorizontal: space.md,
        minHeight: 52,
        borderRadius: radius.md,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.sm,
        paddingVertical: space.xs,
    },
    cover: {
        width: COVER,
        height: COVER,
        borderRadius: radius.sm,
    },
    rowText: {
        flex: 1,
        gap: 2,
    },
    bar: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.sm,
        paddingHorizontal: space.md,
        paddingVertical: space.sm,
        borderRadius: radius.md,
        borderTopWidth: borderWidth.hairline,
    },
});

export { ThemePreviewSample };
