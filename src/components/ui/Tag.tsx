import { StyleSheet } from 'react-native';

import { radius, space, useColors, type Colors } from '@/design';

import { Text } from './Text';

import type { ComponentProps } from 'react';

/** 配色上下文 → 前景/填充配对（前景复用 text* 语义色） */
const TONE = {
    surface: { text: 'textSecondary', bg: 'surfaceVariant' },
    cover: { text: 'coverTextSecondary', bg: 'coverBorder' },
} as const satisfies Record<string, { text: keyof Colors; bg: keyof Colors }>;

interface TagProps {
    /** Tag 显示的文本 */
    label: string;
    /** 配色上下文：surface=普通表面（默认）；cover=沉浸式正在播放表面 */
    tone?: keyof typeof TONE;
    /** 给了 = 承载语义（读屏朗读）；不给 = 装饰性（读屏跳过） */
    accessibilityLabel?: string;
    /** 透传布局样式（如 maxWidth）；视觉 token 仍由 tone 锁定 */
    style?: ComponentProps<typeof Text>['style'];
}

/** 用于展示元数据的非交互式 Tag */
export function Tag({
    label,
    tone = 'surface',
    accessibilityLabel,
    style,
}: TagProps) {
    const colors = useColors();
    const a11y = accessibilityLabel
        ? { accessible: true, accessibilityLabel }
        : {
              accessible: false,
              accessibilityElementsHidden: true,
              importantForAccessibility: 'no-hide-descendants' as const,
          };
    return (
        <Text
            {...a11y}
            size="xs"
            color={TONE[tone].text}
            lineHeight="normal"
            numberOfLines={1}
            ellipsizeMode="tail"
            style={[
                styles.root,
                style,
                { backgroundColor: colors[TONE[tone].bg] },
            ]}
        >
            {label}
        </Text>
    );
}

const styles = StyleSheet.create({
    root: {
        paddingHorizontal: space.xs,
        borderRadius: radius.sm,
        overflow: 'hidden',
    },
});
