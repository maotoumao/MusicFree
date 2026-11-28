import { StyleSheet, View } from 'react-native';

import { Icon } from '@/components/ui/Icon';
import { Text } from '@/components/ui/Text';
import { borderWidth, layout, space, useColors } from '@/design';

import type { ParseStatus } from '../hooks/useParseStatus';

/**
 * 解析状态条：常驻单行，最低视觉重量
 * 「有时间轴」是需要确认的好消息，只在坏消息时出现会把它变成告警组件；
 * 故不给背景色块、不给徽章，它是一句陈述而不是一个组件
 */
export function ParseStatusBar({ status }: { status: ParseStatus }) {
    const colors = useColors();
    return (
        <View
            accessibilityLiveRegion="polite"
            style={[
                styles.root,
                {
                    backgroundColor: colors.surface,
                    borderTopColor: colors.border,
                    borderBottomColor: colors.border,
                },
            ]}
        >
            <Icon name={status.icon} size="sm" color={status.tone} />
            <Text size="sm" color={status.tone} numberOfLines={1}>
                {status.text}
            </Text>
        </View>
    );
}

const styles = StyleSheet.create({
    root: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.sm,
        height: layout.hitTarget,
        paddingHorizontal: layout.screenGutter,
        borderTopWidth: borderWidth.hairline,
        borderBottomWidth: borderWidth.hairline,
    },
});
