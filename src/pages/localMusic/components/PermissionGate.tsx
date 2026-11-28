import { ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Text } from '@/components/ui/Text';
import { radius, space, useColors } from '@/design';
import { useT } from '@/i18n';

/**
 * 未授权用途说明：小标签 + 圆形承托图标 + 价值标题 + 说明 + 去开启 / 暂不授权
 * 不用居中说明卡，按设计稿以呼吸留白建立“设备音乐库”上下文；可滚以适配横屏 / 分屏
 */
export function PermissionGate({
    requesting,
    onGrant,
    onDismiss,
}: {
    requesting: boolean;
    onGrant: () => void;
    onDismiss: () => void;
}) {
    const t = useT();
    const colors = useColors();
    return (
        <ScrollView
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
        >
            <View
                style={[
                    styles.iconWrap,
                    { backgroundColor: colors.surfaceVariant },
                ]}
            >
                <Icon name="disc-3" size="3xl" color="text" />
            </View>
            <Text size="xl" weight="bold" style={styles.title}>
                {t('localMusic.permission.title')}
            </Text>
            <Text
                size="md"
                color="textSecondary"
                lineHeight="normal"
                style={styles.description}
            >
                {t('localMusic.permission.description')}
            </Text>
            <View style={styles.actions}>
                <Button
                    loading={requesting}
                    disabled={requesting}
                    onPress={onGrant}
                >
                    {t('localMusic.permission.grant')}
                </Button>
                <Button
                    variant="ghost"
                    tone="neutral"
                    disabled={requesting}
                    onPress={onDismiss}
                >
                    {t('localMusic.permission.dismiss')}
                </Button>
            </View>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    content: {
        flexGrow: 1,
        alignItems: 'center',
        paddingHorizontal: space.xl,
        paddingTop: space['3xl'],
        paddingBottom: space.xl,
    },
    // 圆形承托尺寸为组件专属几何字面量（图标视觉焦点，非语义 token 尺度）
    iconWrap: {
        marginTop: space.xl,
        width: 96,
        height: 96,
        borderRadius: radius.full,
        alignItems: 'center',
        justifyContent: 'center',
    },
    title: {
        marginTop: space.xl,
        textAlign: 'center',
    },
    description: {
        marginTop: space.sm,
        maxWidth: 300,
        textAlign: 'center',
    },
    actions: {
        marginTop: space['2xl'],
        alignSelf: 'stretch',
        gap: space.sm,
    },
});
