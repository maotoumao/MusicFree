/**
 * 渲染崩溃后的兜底页
 *
 * 能在 `Providers` 之外照常工作：`t()` 是普通函数、`useColors()` 读的是 jotai
 * 默认 store（本项目刻意不加 jotai Provider），而语言与主题都在 `bootstrap` 的
 * 首个 await 之前同步恢复。外层缺的只有安全区与导航——用固定内边距顶掉前者，
 * 用 `canNavigate` 关掉后者。
 *
 * 不提供「重试」：坏状态还在的话点了立刻再崩，反而让人以为是自己操作有问题。
 */
import { ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Text } from '@/components/ui/Text';
import { layout, space, useColors } from '@/design';
import { t } from '@/i18n';
import { os } from '@/infra/device';
import NativeSystem from '@/infra/systemGates';

import { copy } from './copy';

interface ErrorScreenProps {
    error: Error;
    onGoHome(): void;
}

/** Providers 之外拿不到安全区，用一个够躲开状态栏的固定值 */
const FALLBACK_TOP_INSET = 48;

export function ErrorScreen({ error, onGoHome }: ErrorScreenProps) {
    const colors = useColors();
    return (
        <View style={[styles.root, { backgroundColor: colors.background }]}>
            <ScrollView contentContainerStyle={styles.content}>
                <Icon name="triangle-alert" size="3xl" color="danger" />
                <Text size="xl" weight="bold" style={styles.centered}>
                    {t('errorScreen.title')}
                </Text>
                <Text size="sm" color="textSecondary" style={styles.centered}>
                    {t('errorScreen.description')}
                </Text>
                <Text size="xs" color="textDisabled" style={styles.centered}>
                    {t('errorScreen.privacyHint')}
                </Text>
                <View
                    style={[
                        styles.detail,
                        {
                            backgroundColor: colors.surfaceVariant,
                            borderColor: colors.border,
                        },
                    ]}
                >
                    <Text size="sm" color="textSecondary">
                        {`${error.name}: ${error.message}`}
                    </Text>
                </View>
                <View style={styles.actions}>
                    <Button icon="copy" onPress={() => copy(error)}>
                        {t('errorScreen.copy')}
                    </Button>
                    <Button variant="outline" icon="house" onPress={onGoHome}>
                        {t('errorScreen.goHome')}
                    </Button>
                    {os === 'android' ? (
                        <Button
                            variant="ghost"
                            tone="danger"
                            onPress={() => NativeSystem.exitApp()}
                        >
                            {t('errorScreen.restart')}
                        </Button>
                    ) : null}
                </View>
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1 },
    content: {
        flexGrow: 1,
        justifyContent: 'center',
        alignItems: 'center',
        gap: space.md,
        paddingTop: FALLBACK_TOP_INSET,
        paddingBottom: space['2xl'],
        paddingHorizontal: layout.screenGutter,
    },
    centered: { textAlign: 'center' },
    detail: {
        alignSelf: 'stretch',
        maxWidth: layout.listContentMaxWidth,
        padding: space.md,
        borderRadius: space.sm,
        borderWidth: StyleSheet.hairlineWidth,
    },
    actions: { alignSelf: 'stretch', gap: space.sm },
});
