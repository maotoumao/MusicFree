import { Pressable, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { usePressFade } from '@/components/hooks/usePressFade';
import { layout, opacity, radius, space, useColors } from '@/design';

import { Icon } from './Icon';
import { Spinner } from './Spinner';
import { Text } from './Text';

import type { IconName } from './icons.generated';

/** 图标与标签的着色档；与 Icon / Text 的语义色对齐 */
type LabeledIconTone = 'text' | 'primary' | 'danger';

interface LabeledIconButtonProps {
    icon: IconName;
    /** 标签文字；缺省也作读屏名 */
    label: string;
    onPress: () => void;
    /** 图标与标签着色；缺省中性 */
    tone?: LabeledIconTone;
    /** 单独指定标签着色；缺省跟随 tone（如收藏态只想高亮图标、标签保持中性） */
    labelTone?: LabeledIconTone;
    disabled?: boolean;
    /** 执行中：内容留位隐形、居中 spinner（宽度零跳动） */
    busy?: boolean;
    /** 给出即为 toggle 语义（读屏报选中态） */
    selected?: boolean;
    /** 覆盖读屏名（如收藏态下报「取消收藏」） */
    accessibilityLabel?: string;
}

/**
 * 图标在上、标签在下的动作按钮：无底色，按压 ripple，等宽填充所在按钮排
 * 供操作条 / 快捷条等「一排并列动作」复用；一次只表达一个动作，不承载列表语义
 */
export function LabeledIconButton({
    icon,
    label,
    onPress,
    tone = 'text',
    labelTone,
    disabled = false,
    busy = false,
    selected,
    accessibilityLabel,
}: LabeledIconButtonProps) {
    const colors = useColors();
    const { overlayStyle, onPressIn, onPressOut } = usePressFade();
    return (
        <Pressable
            onPress={disabled ? undefined : onPress}
            onPressIn={disabled ? undefined : onPressIn}
            onPressOut={disabled ? undefined : onPressOut}
            disabled={disabled}
            accessibilityRole={
                selected === undefined ? 'button' : 'togglebutton'
            }
            accessibilityLabel={accessibilityLabel ?? label}
            accessibilityState={{ disabled, busy, selected }}
            style={[
                styles.button,
                // 忙碌不降透明度：由 spinner 表达，避免与禁用态混淆
                disabled && !busy ? { opacity: opacity.disabled } : null,
            ]}
        >
            <Animated.View
                pointerEvents="none"
                style={[
                    StyleSheet.absoluteFill,
                    styles.ripple,
                    { backgroundColor: colors.ripple },
                    overlayStyle,
                ]}
            />
            {busy ? (
                <View style={styles.spinner} pointerEvents="none">
                    <Spinner size="md" color={tone} />
                </View>
            ) : null}
            <View style={busy ? styles.hiddenContent : styles.content}>
                <Icon name={icon} size="lg" color={tone} />
                <Text size="xs" numberOfLines={1} color={labelTone ?? tone}>
                    {label}
                </Text>
            </View>
        </Pressable>
    );
}

const styles = StyleSheet.create({
    button: {
        flex: 1,
        minHeight: layout.hitTarget,
        alignItems: 'center',
        justifyContent: 'center',
        gap: space.xs,
        paddingVertical: space.md,
        borderRadius: radius.md,
        overflow: 'hidden',
    },
    content: {
        alignItems: 'center',
        gap: space.xs,
    },
    // 忙碌时内容留位但隐形，spinner 绝对居中叠上，宽度零跳动
    hiddenContent: {
        alignItems: 'center',
        gap: space.xs,
        opacity: 0,
    },
    spinner: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        alignItems: 'center',
        justifyContent: 'center',
    },
    ripple: {
        borderRadius: radius.md,
    },
});
