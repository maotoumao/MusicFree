import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withTiming,
} from 'react-native-reanimated';

import { usePressAnimation } from '@/components/hooks/usePressAnimation';
import {
    borderWidth,
    duration,
    easing,
    layout,
    radius,
    space,
    useColors,
} from '@/design';

import { Text } from './Text';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** 下划线指示条厚度（组件专属几何，无对应全局 token） */
const TAB_INDICATOR_HEIGHT = 2;

export interface TabItem<K extends string = string> {
    /** 稳定标识（如 MediaType） */
    key: K;
    label: string;
}

type TabAlign = 'fill' | 'start';

/** start 模式下单个 tab 的实测位置 */
interface TabRect {
    x: number;
    width: number;
}

interface TabsProps<K extends string = string> {
    items: readonly TabItem<K>[];
    /** 当前选中项 key */
    value: K;
    onChange: (key: K) => void;
    /** fill=等宽铺满（默认，含全宽底分隔）；start=左对齐紧凑（下划线按实测宽度滑动） */
    align?: TabAlign;
    fontSize?: 'sm' | 'md' | 'lg';
}

/**
 * 通用下划线 tab 选择器：纯点选、无 pager（内容切换由调用方处理）
 * 切换时下划线滑动过渡；fill 等宽定位、start 按每 tab 实测宽度定位
 */
export function Tabs<K extends string>({
    items,
    value,
    onChange,
    align = 'fill',
    fontSize = 'md',
}: TabsProps<K>) {
    const colors = useColors();
    const barWidth = useSharedValue(0);
    const count = items.length;
    // -1 = value 不在 items（异常 / 调用错误）→ 隐藏指示条，不伪装选中第一项
    const activeIndex = items.findIndex(item => item.key === value);
    const fillInset = space.xl;
    // start 模式：实测每个 tab 的 { x, 宽度 }；用 state（而非数组 shared value）才能可靠触发指示条重算
    const [tabRects, setTabRects] = useState<(TabRect | undefined)[]>([]);

    // 动画「索引」而非像素目标：宽度变化（旋转 / 分屏）让指示条即时跟随布局，只有切 tab 才滑动
    const animatedIndex = useSharedValue(Math.max(activeIndex, 0));
    useEffect(() => {
        if (activeIndex >= 0) {
            animatedIndex.value = withTiming(activeIndex, {
                duration: duration.base,
                easing: easing.standard,
            });
        }
    }, [activeIndex, animatedIndex]);

    const measureTab = useCallback(
        (index: number, x: number, width: number) => {
            setTabRects(prev => {
                const cur = prev[index];
                if (cur && cur.x === x && cur.width === width) {
                    return prev;
                }
                const next = [...prev];
                next[index] = { x, width };
                return next;
            });
        },
        [],
    );

    const indicatorStyle = useAnimatedStyle(() => {
        if (count === 0 || activeIndex < 0) {
            return { width: 0, transform: [{ translateX: 0 }] };
        }
        // 等宽 → 下划线宽度恒定、只滑 translateX；内缩让线压在文字下
        if (align === 'fill') {
            const tabWidth = barWidth.value / count;
            return {
                width: Math.max(tabWidth - fillInset * 2, 0),
                transform: [
                    { translateX: animatedIndex.value * tabWidth + fillInset },
                ],
            };
        }
        // 内容宽 → 在相邻 tab 的实测 { x, 宽度 } 间线性插值；端点未测完则先隐藏
        const i = Math.max(
            0,
            Math.min(Math.floor(animatedIndex.value), count - 1),
        );
        const j = Math.min(i + 1, count - 1);
        const a = tabRects[i];
        const b = tabRects[j];
        if (!a || !b) {
            return { width: 0, transform: [{ translateX: 0 }] };
        }
        const f = animatedIndex.value - i;
        const x = a.x + (b.x - a.x) * f;
        const w = a.width + (b.width - a.width) * f;
        return { width: w, transform: [{ translateX: x }] };
    }, [tabRects, align, count, activeIndex, fillInset]);

    return (
        <View
            accessibilityRole="tablist"
            onLayout={e => {
                barWidth.value = e.nativeEvent.layout.width;
            }}
            style={[
                align === 'fill' ? styles.barFill : styles.barStart,
                align === 'fill'
                    ? {
                          backgroundColor: colors.surface,
                          borderBottomColor: colors.border,
                      }
                    : null,
            ]}
        >
            {items.map((item, index) => (
                <Tab
                    key={item.key}
                    label={item.label}
                    selected={item.key === value}
                    align={align}
                    fontSize={fontSize}
                    onPress={() => {
                        // 点当前项不重复触发 onChange，避免调用方误重查 / 重置
                        if (item.key !== value) {
                            onChange(item.key);
                        }
                    }}
                    onMeasure={
                        align === 'start'
                            ? (x, w) => measureTab(index, x, w)
                            : undefined
                    }
                />
            ))}
            {activeIndex >= 0 ? (
                <Animated.View
                    pointerEvents="none"
                    style={[
                        styles.indicator,
                        { backgroundColor: colors.primary },
                        indicatorStyle,
                    ]}
                />
            ) : null}
        </View>
    );
}

/** 单个 tab 项：按压 opacity 淡化（跨平台 / iOS 风格，与 Chip·Button 一致，不用 Android 水波纹） */
function Tab({
    label,
    selected,
    fontSize,
    align,
    onPress,
    onMeasure,
}: {
    label: string;
    selected: boolean;
    align: TabAlign;
    fontSize?: 'sm' | 'md' | 'lg';
    onPress: () => void;
    onMeasure?: (x: number, width: number) => void;
}) {
    const { animatedStyle, onPressIn, onPressOut } = usePressAnimation(1);
    return (
        <AnimatedPressable
            onPress={onPress}
            onPressIn={onPressIn}
            onPressOut={onPressOut}
            onLayout={
                onMeasure
                    ? e => {
                          const { x, width } = e.nativeEvent.layout;
                          onMeasure(x, width);
                      }
                    : undefined
            }
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={label}
            style={[
                align === 'fill' ? styles.tabFill : styles.tabStart,
                animatedStyle,
            ]}
        >
            <Text
                size={fontSize ?? 'md'}
                weight={selected ? 'medium' : 'regular'}
                color={selected ? 'onPrimarySoft' : 'textSecondary'}
                numberOfLines={1}
            >
                {label}
            </Text>
        </AnimatedPressable>
    );
}

const styles = StyleSheet.create({
    barFill: {
        flexDirection: 'row',
        borderBottomWidth: borderWidth.hairline,
    },
    barStart: {
        flexDirection: 'row',
        gap: space.lg,
    },
    tabFill: {
        flex: 1,
        minHeight: layout.hitTarget,
        alignItems: 'center',
        justifyContent: 'center',
    },
    tabStart: {
        minWidth: layout.hitTarget,
        minHeight: layout.hitTarget,
        alignItems: 'center',
        justifyContent: 'center',
    },
    // 单条滑动下划线：left:0 起点，位置 / 宽度由动画驱动
    indicator: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        height: TAB_INDICATOR_HEIGHT,
        borderRadius: radius.full,
    },
});
