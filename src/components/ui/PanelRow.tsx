import { Pressable, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { usePressFade } from '@/components/hooks/usePressFade';
import { Icon } from '@/components/ui/Icon';
import { Text } from '@/components/ui/Text';
import { borderWidth, iconSize, layout, space, useColors } from '@/design';

import type { IconName } from '@/components/ui/icons.generated';

interface PanelRowProps {
    label: string;
    /** 纯展示/占位（disabled）行可省略 */
    onPress?: () => void;
    /** 右侧 secondary 值（设置项当前值）；不传则为纯动作行 */
    value?: string;
    icon?: IconName;
    /** 读屏提示：标签说不清「按下会怎样」时补充（如信息行按下是复制） */
    accessibilityHint?: string;
    /** 列表含图标行时为无图标项保留同宽槽，保持文案左缘对齐 */
    reserveIconSpace?: boolean;
    selected?: boolean;
    /**
     * 该行是开关而非一次性动作：读屏报 togglebutton + 已选中 / 未选中
     * 缺省的 button + `selected` 只在开态有播报，关态与普通动作行无从区分
     */
    toggle?: boolean;
    disabled?: boolean;
    danger?: boolean;
    separatorBefore?: boolean;
}

/** Panel 内容行：full-bleed 范围由父容器提供，行自身负责内距、反馈与语义状态 */
export function PanelRow({
    label,
    onPress,
    value,
    icon,
    accessibilityHint,
    reserveIconSpace = false,
    selected = false,
    toggle = false,
    disabled = false,
    danger = false,
    separatorBefore = false,
}: PanelRowProps) {
    const colors = useColors();
    const { overlayStyle, onPressIn, onPressOut } = usePressFade();
    const color = disabled ? 'textDisabled' : danger ? 'danger' : 'text';
    const selectedColor = disabled ? 'textDisabled' : 'primary';
    return (
        <Pressable
            onPress={disabled ? undefined : onPress}
            onPressIn={disabled ? undefined : onPressIn}
            onPressOut={disabled ? undefined : onPressOut}
            disabled={disabled}
            accessibilityRole={toggle ? 'togglebutton' : 'button'}
            accessibilityLabel={label}
            accessibilityHint={accessibilityHint}
            accessibilityValue={
                value !== undefined ? { text: value } : undefined
            }
            accessibilityState={
                toggle
                    ? { disabled, selected, checked: selected }
                    : { disabled, selected }
            }
            style={[
                styles.row,
                separatorBefore
                    ? {
                          borderTopWidth: borderWidth.hairline,
                          borderTopColor: colors.border,
                      }
                    : null,
            ]}
        >
            {/* 按压覆盖背景：铺满整行、淡入淡出、不拦截触摸 */}
            <Animated.View
                pointerEvents="none"
                style={[
                    StyleSheet.absoluteFill,
                    { backgroundColor: colors.ripple },
                    overlayStyle,
                ]}
            />
            {icon || reserveIconSpace ? (
                <View style={styles.iconSlot}>
                    {icon ? <Icon name={icon} size="md" color={color} /> : null}
                </View>
            ) : null}
            <Text
                size="md"
                color={color}
                numberOfLines={1}
                style={styles.label}
            >
                {label}
            </Text>
            {value !== undefined ? (
                <Text
                    size="sm"
                    color={disabled ? 'textDisabled' : 'textSecondary'}
                    numberOfLines={1}
                    style={styles.value}
                >
                    {value}
                </Text>
            ) : null}
            {selected ? (
                <Icon name="check" size="md" color={selectedColor} />
            ) : null}
        </Pressable>
    );
}

const styles = StyleSheet.create({
    row: {
        minHeight: layout.hitTarget,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.md,
        paddingHorizontal: space.lg,
        paddingVertical: space.md,
    },
    iconSlot: {
        width: iconSize.lg,
        alignItems: 'center',
    },
    label: {
        flex: 1,
    },
    value: {
        flexShrink: 1,
        textAlign: 'right',
    },
});
