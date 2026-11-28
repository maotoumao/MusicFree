import { useEffect, useRef } from 'react';
import { AccessibilityInfo, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Text } from '@/components/ui/Text';
import { radius, space, useColors } from '@/design';
import { useT } from '@/i18n';

import {
    useConsoleCopy,
    type ScanConsoleContext,
} from '../hooks/useConsoleCopy';

/**
 * 扫描控制台：扫描的统一发起处，按上下文切文案/元素（首次、重扫、上次结果）
 * 不复用 ContentUnavailable（那是内容缺失，此处是尚未执行的可控操作）；沿用权限门的呼吸留白与承托焦点
 */
export function ScanGateView({
    context,
    onStart,
    onManage,
}: {
    context: ScanConsoleContext;
    onStart: () => void;
    onManage: () => void;
}) {
    const t = useT();
    const colors = useColors();
    const copy = useConsoleCopy(context);
    const titleRef = useRef<View>(null);
    // 进入待扫描态时把读屏焦点落到标题（header）；用 Fabric-aware 的 HostInstance API（读屏未开时无副作用）
    useEffect(() => {
        const node = titleRef.current;
        if (node) {
            AccessibilityInfo.sendAccessibilityEvent(node, 'focus');
        }
    }, []);
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
            <View ref={titleRef} accessible accessibilityRole="header">
                <Text size="xl" weight="bold" style={styles.title}>
                    {copy.title}
                </Text>
            </View>
            {context.kind === 'rescan' ? (
                <Text
                    size="sm"
                    color="textSecondary"
                    style={styles.currentCount}
                >
                    {t('localMusic.scanGate.rescanCurrent', {
                        count: context.count,
                    })}
                </Text>
            ) : null}
            <Text
                size="md"
                color="textSecondary"
                lineHeight="normal"
                style={styles.description}
            >
                {copy.description}
            </Text>
            <View style={styles.actions}>
                <Button onPress={onStart} accessibilityLabel={copy.primaryA11y}>
                    {copy.primaryLabel}
                </Button>
                <Button variant="ghost" tone="neutral" onPress={onManage}>
                    {t('localMusic.empty.manageScanRange')}
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
    currentCount: {
        marginTop: space.xs,
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
