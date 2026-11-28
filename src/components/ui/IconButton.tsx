import { Pressable, StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';

import { usePressAnimation } from '@/components/hooks/usePressAnimation';
import { iconSize, layout, opacity, pressScale, type Colors } from '@/design';

import { Icon } from './Icon';
import { iconButtonEdgeInset, iconButtonShellPad } from './iconButtonGeometry';
import { Spinner } from './Spinner';

import type { IconName } from './icons.generated';

/** 几何算法抽在 iconButtonGeometry，此处 re-export 维持既有 import 路径 */
export { iconButtonEdgeInset };
const shellPad = iconButtonShellPad;

interface IconButtonProps {
    icon: IconName;
    /** 内部图标尺寸（默认 md）；不改变外壳尺寸 */
    size?: keyof typeof iconSize;
    /** 紧凑外壳：改用 chipHeight×chipHeight，仅供空间受限的复合控件 */
    compact?: boolean;
    /** 语义色（默认 text）；语义 token 优先 + 原始色 override */
    tone?: keyof Colors | (string & {});
    disabled?: boolean;
    /** 忙碌态：图标换成旋转 Spinner，按钮仍可点 */
    busy?: boolean;
    /** 给出即为 toggle 语义（读屏报选中态）；缺省为普通按钮 */
    checked?: boolean;
    onPress: () => void;
    /** 必填：纯图标无文字兜底，读屏必须有名 */
    accessibilityLabel: string;
    /** 可选：在 44 地板之上再扩命中范围（只增不减） */
    hitSlop?: number;
    /**
     * 贴容器边缘时声明所在侧：壳向该侧外拉一个壳内留白，使图标本体而非 44 命中壳与内容线对齐
     * 命中区不缩小；容器只需给正常内容内边距。外拉后的壳须仍落在最近的 overflow:'hidden' 祖先内
     */
    edgeAlign?: 'start' | 'end';
}

/** 图标按钮：默认 44×44、compact 时 34×34 外壳；只缩内部 Icon 的按压反馈 */
export function IconButton({
    icon,
    size = 'md',
    compact = false,
    tone = 'text',
    disabled = false,
    busy = false,
    checked,
    onPress,
    accessibilityLabel,
    hitSlop,
    edgeAlign,
}: IconButtonProps) {
    const { animatedStyle, onPressIn, onPressOut } = usePressAnimation(
        pressScale.compact,
    );
    // disabled 上色：中性色图标切 textDisabled；语义/自定义色整体叠 opacity
    const isNeutral = tone === 'text' || tone === 'textSecondary';
    const color = disabled && isNeutral ? 'textDisabled' : tone;
    // 只增不减：负 hitSlop 会缩小命中区，钳到 >=0
    const extraHitSlop = hitSlop == null ? undefined : Math.max(0, hitSlop);
    // 贴边外拉：只挪壳的位置，44 命中面积不变
    const edgeStyle =
        edgeAlign === 'start'
            ? { marginStart: -shellPad(size) }
            : edgeAlign === 'end'
            ? { marginEnd: -shellPad(size) }
            : null;
    return (
        <Pressable
            onPress={disabled ? undefined : onPress}
            onPressIn={disabled ? undefined : onPressIn}
            onPressOut={disabled ? undefined : onPressOut}
            disabled={disabled}
            hitSlop={extraHitSlop}
            accessibilityRole={
                checked === undefined ? 'button' : 'togglebutton'
            }
            accessibilityLabel={accessibilityLabel}
            accessibilityState={{ disabled, busy, checked }}
            style={[
                styles.shell,
                compact ? styles.shellCompact : null,
                edgeStyle,
                disabled && !isNeutral ? { opacity: opacity.disabled } : null,
            ]}
        >
            <Animated.View style={disabled ? undefined : animatedStyle}>
                {busy ? (
                    <Spinner size={size} color={color} />
                ) : (
                    <Icon name={icon} size={size} color={color} />
                )}
            </Animated.View>
        </Pressable>
    );
}

const styles = StyleSheet.create({
    shell: {
        width: layout.hitTarget,
        height: layout.hitTarget,
        alignItems: 'center',
        justifyContent: 'center',
    },
    shellCompact: {
        width: layout.chipHeight,
        height: layout.chipHeight,
    },
});
