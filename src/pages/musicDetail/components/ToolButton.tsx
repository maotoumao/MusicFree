/**
 * 工具行按钮：图标 + 单行标签（封面 / 歌词工具行共用）
 * accent = 非默认态，图标与标签转 accentColor 强调（缺省跟随封面取色）
 */
import { useEffect } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';

import { usePressAnimation } from '@/components/hooks/usePressAnimation';
import { Icon } from '@/components/ui/Icon';
import { Text } from '@/components/ui/Text';
import { layout, opacity, pressScale, space } from '@/design';

import type { IconName } from '@/components/ui/icons.generated';

interface ToolButtonProps {
    icon: IconName;
    label: string;
    onPress: () => void;
    /** 长按次级动作（如桌面歌词长按开设置面板）；不给则无长按 */
    onLongPress?: () => void;
    /** 非默认态：图标与标签转强调色（如音质非标准、倍速非 1×） */
    accent?: boolean;
    /**
     * 强调时用哪个色；缺省跟随封面取色
     * 「已下载」这类**固定语义**的状态不该随封面变色，否则同一个意思换首歌就换个颜色
     */
    accentColor?: 'coverAccent' | 'success';
    /** 前置条件未满足时置灰禁点（如无译文时的翻译） */
    disabled?: boolean;
    /** 开关型工具的当前开启态：给了才按 togglebutton + checked 语义读屏（如翻译） */
    selected?: boolean;
    accessibilityLabel: string;
}

export function ToolButton({
    icon,
    label,
    onPress,
    onLongPress,
    accent = false,
    accentColor = 'coverAccent',
    disabled = false,
    selected,
    accessibilityLabel,
}: ToolButtonProps) {
    const { animatedStyle, onPressIn, onPressOut } = usePressAnimation(
        pressScale.compact,
    );
    // 按压途中变 disabled（如按住翻译时切歌）时 onPressOut 不再触发，主动复位免卡在按下态
    useEffect(() => {
        if (disabled) {
            onPressOut();
        }
    }, [disabled, onPressOut]);
    // 禁用时不显 accent 高亮，避免「高亮又置灰」的矛盾观感（开关偏好仍留存、可用时自动恢复）
    const showAccent = accent && !disabled;
    return (
        <Pressable
            onPress={disabled ? undefined : onPress}
            onLongPress={disabled ? undefined : onLongPress}
            onPressIn={disabled ? undefined : onPressIn}
            onPressOut={disabled ? undefined : onPressOut}
            disabled={disabled}
            accessibilityRole={
                selected === undefined ? 'button' : 'togglebutton'
            }
            accessibilityLabel={accessibilityLabel}
            accessibilityState={{ disabled, checked: selected }}
            style={[styles.tool, disabled && styles.toolDisabled]}
        >
            <Animated.View style={[styles.toolInner, animatedStyle]}>
                <Icon
                    name={icon}
                    size="md"
                    color={showAccent ? accentColor : 'coverText'}
                />
                <Text
                    size="xs"
                    color={showAccent ? accentColor : 'coverTextSecondary'}
                    numberOfLines={1}
                >
                    {label}
                </Text>
            </Animated.View>
        </Pressable>
    );
}

const styles = StyleSheet.create({
    tool: {
        flex: 1,
        minHeight: layout.hitTarget,
        alignItems: 'center',
        justifyContent: 'center',
    },
    toolDisabled: {
        opacity: opacity.disabled,
    },
    toolInner: {
        alignItems: 'center',
        gap: space.xs,
    },
});
