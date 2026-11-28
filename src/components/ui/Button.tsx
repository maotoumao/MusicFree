import {
    Pressable,
    StyleSheet,
    View,
    type StyleProp,
    type ViewStyle,
} from 'react-native';
import Animated from 'react-native-reanimated';

import { usePressAnimation } from '@/components/hooks/usePressAnimation';
import {
    borderWidth,
    fontSize,
    iconSize,
    layout,
    pressScale,
    radius,
    space,
    useColors,
    type Colors,
} from '@/design';

import { Icon } from './Icon';
import { Spinner } from './Spinner';
import { Text } from './Text';

import type { IconName } from './icons.generated';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Variant = 'filled' | 'outline' | 'ghost' | 'soft';
type Size = 'sm' | 'md' | 'lg';
type Tone = 'primary' | 'danger' | 'neutral';

interface ButtonBaseProps {
    /** 三尺寸（默认 md） */
    size?: Size;
    /** 前置图标（可选） */
    icon?: IconName;
    /** 标签文字（必填） */
    children: string;
    loading?: boolean;
    disabled?: boolean;
    onPress: () => void;
    /** 透传布局（如 Panel footer 的 flex:1） */
    style?: StyleProp<ViewStyle>;
    /** 缺省用 children */
    accessibilityLabel?: string;
}

/**
 * 变体与语气的合法组合
 * filled / outline / ghost（默认 filled）接完整 tone 轴（默认 primary）；
 * soft = 低透明品牌底，语义色只有 primarySoft / onPrimarySoft 一对，故不接 tone
 */
type VariantProps =
    | { variant?: Exclude<Variant, 'soft'>; tone?: Tone }
    | { variant: 'soft'; tone?: never };

type ButtonProps = ButtonBaseProps & VariantProps;

// 各档尺寸规格：高度作 minHeight 地板，实际高度由 padding + 行高撑出
const SIZE = {
    sm: {
        minHeight: layout.controlHeight.sm,
        paddingH: space.lg,
        paddingV: space.xs,
        font: 'sm',
        icon: 'xs',
    },
    md: {
        minHeight: layout.controlHeight.md,
        paddingH: space.xl,
        paddingV: space.sm,
        font: 'md',
        icon: 'sm',
    },
    lg: {
        minHeight: layout.controlHeight.lg,
        paddingH: space['2xl'],
        paddingV: space.md,
        font: 'lg',
        icon: 'md',
    },
} as const satisfies Record<
    Size,
    {
        minHeight: number;
        paddingH: number;
        paddingV: number;
        font: keyof typeof fontSize;
        icon: keyof typeof iconSize;
    }
>;

type ColorKey = keyof Colors;

// 颜色只认 variant × tone；状态（pressed/disabled/loading）不参与配色
function resolveColors(
    variant: Variant,
    tone: Tone,
): { bg?: ColorKey; border?: ColorKey; bw: number; fg: ColorKey } {
    if (variant === 'soft') {
        return { bg: 'primarySoft', bw: 0, fg: 'onPrimarySoft' };
    }
    if (variant === 'filled') {
        return {
            bg:
                tone === 'primary'
                    ? 'primary'
                    : tone === 'danger'
                    ? 'danger'
                    : 'surfaceVariant',
            bw: 0,
            fg:
                tone === 'primary'
                    ? 'onPrimary'
                    : tone === 'danger'
                    ? 'onDanger'
                    : 'text',
        };
    }
    const fg: ColorKey =
        tone === 'primary'
            ? 'primary'
            : tone === 'danger'
            ? 'danger'
            : 'textSecondary';
    if (variant === 'outline') {
        return {
            border:
                tone === 'primary'
                    ? 'primary'
                    : tone === 'danger'
                    ? 'danger'
                    : 'border',
            bw: borderWidth.hairline,
            fg,
        };
    }
    return { bw: 0, fg };
}

/** 按钮：颜色由 variant×tone 定、状态只调 opacity；padding 撑高 + minHeight 地板 */
export function Button({
    variant = 'filled',
    size = 'md',
    tone = 'primary',
    icon,
    children,
    loading = false,
    disabled = false,
    onPress,
    style,
    accessibilityLabel,
}: ButtonProps) {
    const colors = useColors();
    const spec = SIZE[size];
    const c = resolveColors(variant, tone);
    const { animatedStyle, onPressIn, onPressOut } = usePressAnimation(
        pressScale.subtle,
        disabled,
    );
    // loading≠disabled：都不可点，但 loading 不降 opacity（是「处理中」非「不可用」）
    const interactable = !disabled && !loading;
    // 正交：不可点=disabled||loading；变暗=仅 disabled；转圈=仅 loading（互不压制）
    const weight = tone === 'neutral' ? 'medium' : 'bold';
    // 命中补偿到 hitTarget：小于地板的档位四向补齐
    const slop = Math.max(
        0,
        Math.ceil((layout.hitTarget - spec.minHeight) / 2),
    );
    // 动态样式（尺寸/主题色）：opacity 交 animatedStyle 统一管，避免与 Reanimated 争同一 native 属性
    const dynamicStyle = {
        minHeight: spec.minHeight,
        paddingHorizontal: spec.paddingH,
        paddingVertical: spec.paddingV,
        borderRadius: radius.md,
        backgroundColor: c.bg ? colors[c.bg] : 'transparent',
        borderColor: c.border ? colors[c.border] : undefined,
        borderWidth: c.bw,
    };
    return (
        <AnimatedPressable
            onPress={interactable ? onPress : undefined}
            onPressIn={interactable ? onPressIn : undefined}
            onPressOut={interactable ? onPressOut : undefined}
            disabled={!interactable}
            hitSlop={slop}
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel ?? children}
            accessibilityState={{ disabled, busy: loading }}
            style={[styles.base, dynamicStyle, animatedStyle, style]}
        >
            <View style={[styles.content, loading ? styles.hidden : null]}>
                {icon ? (
                    <Icon name={icon} size={spec.icon} color={c.fg} />
                ) : null}
                <Text
                    color={c.fg}
                    size={spec.font}
                    weight={weight}
                    lineHeight="tight"
                    numberOfLines={1}
                >
                    {children}
                </Text>
            </View>
            {loading ? (
                <View style={styles.spinner}>
                    <Spinner size={spec.icon} color={c.fg} />
                </View>
            ) : null}
        </AnimatedPressable>
    );
}

const styles = StyleSheet.create({
    base: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    content: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: space.xs,
    },
    hidden: {
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
});
