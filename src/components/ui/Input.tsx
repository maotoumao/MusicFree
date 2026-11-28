import { useCallback } from 'react';
import {
    Pressable,
    StyleSheet,
    TextInput,
    View,
    type StyleProp,
    type TextInputProps,
    type ViewStyle,
} from 'react-native';
import Animated, {
    interpolateColor,
    useAnimatedStyle,
    useSharedValue,
    withTiming,
} from 'react-native-reanimated';

import { usePressAnimation } from '@/components/hooks/usePressAnimation';
import {
    borderWidth,
    duration,
    easing,
    fontSize,
    layout,
    lineHeightMultiplier,
    opacity,
    pressScale,
    radius,
    space,
    useColors,
} from '@/design';
import { useT } from '@/i18n';

import { Icon } from './Icon';
import { Text } from './Text';

import type { IconName } from './icons.generated';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// RN 0.86 的 onFocus/onBlur 事件类型（FocusEvent/BlurEvent）从 props 反取，版本无关
type FocusEvt = Parameters<NonNullable<TextInputProps['onFocus']>>[0];
type BlurEvt = Parameters<NonNullable<TextInputProps['onBlur']>>[0];

// 受控项（设计系统内部决定，不许调用方经这些 prop 覆盖）从 TextInputProps 排除
interface InputProps
    extends Omit<
        TextInputProps,
        | 'value'
        | 'onChangeText'
        | 'style'
        | 'editable'
        | 'readOnly'
        | 'placeholderTextColor'
        | 'allowFontScaling'
        | 'multiline'
        | 'numberOfLines'
    > {
    value: string;
    onChangeText: (text: string) => void;
    /** 高度档：md=44 紧凑（AppBar / 密集场景）/ lg=48 表单默认 */
    size?: 'md' | 'lg';
    /** 前置语境图标（非交互，如搜索放大镜） */
    leadingIcon?: IconName;
    /** 尾部清除按钮：仅当 value 非空且未禁用时渲染 */
    clearable?: boolean;
    /** 点清除时在 onChangeText('') 之后触发（如搜索清空并重置） */
    onClear?: () => void;
    multiline?: boolean;
    /** 仅 multiline：初始/最小可见行数，默认 3 */
    minRows?: number;
    /** 仅 multiline：最大可见行数，超出内部滚动；不填则不封顶 */
    maxRows?: number;
    disabled?: boolean;
    /** 外层容器透传（marginTop / flex / maxHeight）——仅容器，不改字体/内距 */
    style?: StyleProp<ViewStyle>;
}

/** 文本输入图元：容器边框聚焦变色（reanimated，固定 1px）+ 可选前置图标 / 清除按钮 */
export function Input({
    value,
    onChangeText,
    size = 'lg',
    leadingIcon,
    clearable,
    onClear,
    multiline,
    minRows = 3,
    maxRows,
    disabled,
    style,
    placeholder,
    accessibilityLabel,
    onFocus,
    onBlur,
    ...rest
}: InputProps) {
    const colors = useColors();
    const t = useT();
    // 聚焦进度 0→1 驱动 borderColor（border→primary），宽度恒 1px、不动布局
    const focus = useSharedValue(0);
    const animatedBorder = useAnimatedStyle(() => ({
        borderColor: interpolateColor(
            focus.value,
            [0, 1],
            [colors.border, colors.primary],
        ),
    }));
    const clearPress = usePressAnimation(pressScale.compact);
    const handleFocus = useCallback(
        (e: FocusEvt) => {
            focus.value = withTiming(1, {
                duration: duration.fast,
                easing: easing.standard,
            });
            onFocus?.(e);
        },
        [focus, onFocus],
    );
    const handleBlur = useCallback(
        (e: BlurEvt) => {
            focus.value = withTiming(0, {
                duration: duration.fast,
                easing: easing.standard,
            });
            onBlur?.(e);
        },
        [focus, onBlur],
    );
    const handleClear = useCallback(() => {
        onChangeText('');
        onClear?.();
    }, [onChangeText, onClear]);

    const showClear = clearable && value.length > 0 && !disabled;
    // 单行不用原生 placeholder：Android 的 EditText hint 不受行数约束，长文案会折行被容器裁掉。
    // 自绘一层 Text 覆盖在输入区上，超出以省略号收尾；多行仍用原生 placeholder（折行本就合理）
    const selfDrawnPlaceholder = !multiline && !!placeholder;
    // 行高按输入框实际渲染字号估算（未显式设 lineHeight，原生行高约 1.4 倍）
    const rowHeight = fontSize.md * lineHeightMultiplier.normal;
    const inputMinHeight = multiline ? minRows * rowHeight : undefined;
    const inputMaxHeight =
        multiline && maxRows != null ? maxRows * rowHeight : undefined;
    // 动态样式（主题底色 + disabled opacity）：运行时值抽变量，非 inline 字面量
    const dynamicStyle = {
        backgroundColor: colors.surfaceVariant,
        opacity: disabled ? opacity.disabled : 1,
    };
    // 单行高度按 size 档取 minHeight；multiline 走行数、不设 minHeight
    const sizeStyle = multiline
        ? null
        : { minHeight: layout.controlHeight[size] };

    return (
        <Animated.View
            style={[
                styles.container,
                styles.box,
                multiline ? styles.containerMultiline : styles.containerSingle,
                sizeStyle,
                dynamicStyle,
                animatedBorder,
                style,
            ]}
        >
            {leadingIcon ? (
                <Icon
                    name={leadingIcon}
                    size="md"
                    color="textSecondary"
                    style={styles.leading}
                />
            ) : null}
            <View style={styles.field}>
                <TextInput
                    {...rest}
                    value={value}
                    onChangeText={onChangeText}
                    editable={!disabled}
                    multiline={multiline}
                    placeholder={selfDrawnPlaceholder ? undefined : placeholder}
                    // 自绘 placeholder 后原生 hint 不再兜底读屏，用文案本身补上无障碍名
                    accessibilityLabel={accessibilityLabel ?? placeholder}
                    placeholderTextColor={colors.textSecondary}
                    allowFontScaling={false}
                    onFocus={handleFocus}
                    onBlur={handleBlur}
                    textAlignVertical={multiline ? 'top' : 'center'}
                    numberOfLines={multiline ? undefined : 1}
                    style={[
                        styles.input,
                        { color: colors.text },
                        inputMinHeight != null
                            ? { minHeight: inputMinHeight }
                            : null,
                        inputMaxHeight != null
                            ? { maxHeight: inputMaxHeight }
                            : null,
                    ]}
                />
                {selfDrawnPlaceholder && value.length === 0 ? (
                    <View pointerEvents="none" style={styles.placeholder}>
                        <Text color="textSecondary" numberOfLines={1}>
                            {placeholder}
                        </Text>
                    </View>
                ) : null}
            </View>
            {showClear ? (
                <AnimatedPressable
                    onPress={handleClear}
                    onPressIn={clearPress.onPressIn}
                    onPressOut={clearPress.onPressOut}
                    hitSlop={14}
                    accessibilityRole="button"
                    accessibilityLabel={t('common.clear')}
                    style={[styles.clear, clearPress.animatedStyle]}
                >
                    <Icon name="x" size="sm" color="textSecondary" />
                </AnimatedPressable>
            ) : null}
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        paddingHorizontal: space.lg,
    },
    box: {
        borderRadius: radius.md,
        borderWidth: borderWidth.hairline,
    },
    containerSingle: {
        alignItems: 'center',
        paddingVertical: space.sm,
    },
    containerMultiline: {
        alignItems: 'flex-start',
        paddingVertical: space.md,
    },
    input: {
        padding: 0,
        fontSize: fontSize.md,
    },
    // 输入区容器：撑满剩余宽度，并给 placeholder 覆盖层做定位参照
    field: {
        flex: 1,
    },
    placeholder: {
        ...StyleSheet.absoluteFill,
        justifyContent: 'center',
    },
    leading: {
        marginRight: space.sm,
    },
    clear: {
        marginLeft: space.sm,
    },
});
