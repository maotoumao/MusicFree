import { useCallback, useState } from 'react';
import {
    Pressable,
    StyleSheet,
    type AccessibilityRole,
    type LayoutChangeEvent,
} from 'react-native';
import Animated from 'react-native-reanimated';

import { usePressAnimation } from '@/components/hooks/usePressAnimation';
import { layout, radius, space, useColors } from '@/design';

import { IconButton } from './IconButton';
import { Text } from './Text';

/**
 * 四边 hitSlop：把 pill 补齐到 hitTarget 命中基线
 * 换行网格的 gap 需 ≥ hitSlop 之和，否则相邻行的命中区会重叠
 */
const HIT_SLOP = (layout.hitTarget - layout.chipHeight) / 2;

interface ChipProps {
    /** 标签文本 */
    label: string;
    /** 按压回调；省略则为纯状态指示 pill（无按压 / hover 反馈） */
    onPress?: () => void;
    /** 同一胶囊内的独立删除操作 */
    onRemove?: () => void;
    /** 删除操作的无障碍名称 */
    removeAccessibilityLabel?: string;
    /** 受控选中态（如单选或筛选的当前项）；持续高亮并向读屏声明 selected，与按压反馈相互独立 */
    selected?: boolean;
    /** 无障碍标签，默认使用 label */
    accessibilityLabel?: string;
    /** 无障碍角色，默认 button；用作单选行时（如 ChipRow）使用 tab */
    accessibilityRole?: AccessibilityRole;
    /** 布局回调，供父容器测量位置（如 ChipRow 将选中项滚动至视野内） */
    onLayout?: (event: LayoutChangeEvent) => void;
}

/**
 * pill 标签：受控 `selected` 持续高亮（单选或筛选选中项）+ 按压 / hover 瞬时高亮（如搜索历史等快捷项）
 * 省略 `onPress` 即纯状态指示（不接受按压 / hover 反馈，只随 selected 高亮）
 * 高亮使用主色软底并淡入，不缩放以避免 wrap 网格跳动
 */
export function Chip({
    label,
    onPress,
    selected,
    accessibilityLabel,
    accessibilityRole = 'button',
    onRemove,
    removeAccessibilityLabel,
    onLayout,
}: ChipProps) {
    const colors = useColors();
    // scale=1：只要淡入反馈、不缩放
    const {
        animatedStyle,
        onPressIn: animatePressIn,
        onPressOut: animatePressOut,
    } = usePressAnimation(1);
    // 瞬时交互态（按压或指针 hover；hover 仅指针设备触发），与受控 selected 相互独立
    const [interacting, setInteracting] = useState(false);
    const activate = useCallback(() => setInteracting(true), []);
    const deactivate = useCallback(() => setInteracting(false), []);
    // 无 onPress = 纯状态指示 pill（如「当前项」）：不接受按压 / hover 反馈，仅受控 selected 高亮
    const interactive = onPress !== undefined;
    // 受控选中或瞬时交互任一成立 → 主色软底高亮
    const highlighted = selected || (interactive && interacting);
    const handlePressIn = interactive
        ? () => {
              activate();
              animatePressIn();
          }
        : undefined;
    const handlePressOut = interactive
        ? () => {
              deactivate();
              animatePressOut();
          }
        : undefined;
    const backgroundColor = highlighted
        ? colors.primarySoft
        : colors.surfaceVariant;

    return (
        <Animated.View
            onLayout={onLayout}
            style={[styles.root, { backgroundColor }, animatedStyle]}
        >
            <Pressable
                onPress={onPress}
                onPressIn={handlePressIn}
                onPressOut={handlePressOut}
                onHoverIn={interactive ? activate : undefined}
                onHoverOut={interactive ? deactivate : undefined}
                hitSlop={onRemove ? undefined : HIT_SLOP}
                accessibilityRole={accessibilityRole}
                accessibilityState={{ selected }}
                accessibilityLabel={accessibilityLabel ?? label}
                style={[styles.label, onRemove ? styles.removableLabel : null]}
            >
                <Text
                    size="sm"
                    weight={selected ? 'medium' : 'regular'}
                    color={highlighted ? 'onPrimarySoft' : 'textSecondary'}
                    numberOfLines={1}
                >
                    {label}
                </Text>
            </Pressable>
            {onRemove ? (
                <IconButton
                    icon="x"
                    size="xs"
                    compact
                    tone="textSecondary"
                    onPress={onRemove}
                    accessibilityLabel={removeAccessibilityLabel ?? label}
                />
            ) : null}
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    root: {
        flexDirection: 'row',
        gap: space.xs,
        maxWidth: '100%',
        minWidth: layout.hitTarget,
        minHeight: layout.chipHeight,
        borderRadius: radius.full,
        alignSelf: 'flex-start',
        alignItems: 'center',
        justifyContent: 'center',
    },
    label: {
        flexShrink: 1,
        minHeight: layout.chipHeight,
        alignSelf: 'stretch',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: space.sm,
        paddingVertical: space.sm,
    },
    removableLabel: {
        paddingRight: 0,
    },
});
