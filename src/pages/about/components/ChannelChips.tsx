import { Pressable, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/ui/Icon';
import { Text } from '@/components/ui/Text';
import { layout, opacity, radius, space, useColors } from '@/design';

import type { IconName } from '@/components/ui/icons.generated';

/**
 * 胶囊视觉高度（dp）：不取 layout.chipHeight 34
 * 34 需要 5dp 四边 hitSlop 才够命中基线，而胶囊间距只有 8dp，相邻命中区会重叠；
 * 40 只差 2dp，间距 8 > 4 才排得开
 */
const CHIP_HEIGHT = 40;

/** 命中补偿：视觉高度与最小命中目标的差额，分摊到四边 */
const HIT_SLOP = (layout.hitTarget - CHIP_HEIGHT) / 2;

interface ChannelChipProps {
    icon: IconName;
    /** 平台名（非账号名）：公众号与小红书账号同名，账号名已无法区分项目 */
    label: string;
    onPress: () => void;
    /** 补充说明按下之后会发生什么（离开 App / 开浮层） */
    accessibilityHint?: string;
}

/**
 * 渠道胶囊：作者的一个可去之处
 * 与通用 Chip 的区别在语义——Chip 是「可被选中的筛选项」（常态中性、选中才高亮），
 * 这里三枚是并列的常驻入口，没有选中态，故常态即主色软底
 */
export function ChannelChip({
    icon,
    label,
    onPress,
    accessibilityHint,
}: ChannelChipProps) {
    const colors = useColors();
    return (
        <Pressable
            onPress={onPress}
            hitSlop={HIT_SLOP}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityHint={accessibilityHint}
            style={({ pressed }) => [
                styles.root,
                { backgroundColor: colors.primarySoft },
                pressed ? { opacity: opacity.pressed } : null,
            ]}
        >
            <Icon name={icon} size="sm" color="onPrimarySoft" />
            <Text size="sm" color="onPrimarySoft" numberOfLines={1}>
                {label}
            </Text>
        </Pressable>
    );
}

/** 胶囊行容器：左对齐到内容线，放不下自动换行 */
export function ChannelChipRow({ children }: { children: React.ReactNode }) {
    return <View style={styles.row}>{children}</View>;
}

const styles = StyleSheet.create({
    root: {
        height: CHIP_HEIGHT,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.xs,
        paddingHorizontal: space.md,
        borderRadius: radius.full,
    },
    // 上下距不对称：贴近上方身份行（同属「这个人」），与下方列表行拉开
    row: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: space.sm,
        paddingHorizontal: layout.screenGutter,
        paddingTop: space.xs,
        paddingBottom: space.md,
    },
});
