import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
    Easing,
    cancelAnimation,
    useAnimatedStyle,
    useReducedMotion,
    useSharedValue,
    withDelay,
    withRepeat,
    withSequence,
    withTiming,
} from 'react-native-reanimated';

import { useColors, type Colors } from '@/design';

// 组件专属几何字面量（无对应 token）：细竖条尺寸与跳动高度区间
const BAR_WIDTH = 3;
const BAR_GAP = 2;
const MIN_HEIGHT = 3;
const MAX_HEIGHT = 13;
// 三根条各自时长 + 起始延迟错开跳动；rest = 暂停/静止时的高度，三根不等→静止时也是错落的均衡器形状而非齐平一条
const BARS: readonly { duration: number; delay: number; rest: number }[] = [
    { duration: 420, delay: 0, rest: 6 },
    { duration: 500, delay: 120, rest: 12 },
    { duration: 360, delay: 240, rest: 8 },
];

interface PlayingIndicatorProps {
    /** 播放中才跳动；暂停 / 停止时静止在各自休止高度 */
    animating: boolean;
    /** 竖条颜色（默认与高亮标题同色系） */
    color?: keyof Colors;
}

function Bar({
    animating,
    color,
    duration,
    delay,
    rest,
}: {
    animating: boolean;
    color: string;
    duration: number;
    delay: number;
    rest: number;
}) {
    const height = useSharedValue(rest);
    useEffect(() => {
        if (animating) {
            // 先从各自 rest 平滑降到 MIN，再在 [MIN, MAX] 间对称乒乓往返（reverse=true，两端速度归零）
            // 避免直接从 rest 起跳导致首拍幅度不一——尤其 rest 接近 MAX 的中间条会像突变
            height.value = withDelay(
                delay,
                withSequence(
                    withTiming(MIN_HEIGHT, {
                        duration: duration / 2,
                        easing: Easing.inOut(Easing.ease),
                    }),
                    withRepeat(
                        withTiming(MAX_HEIGHT, {
                            duration,
                            easing: Easing.inOut(Easing.ease),
                        }),
                        -1,
                        true,
                    ),
                ),
            );
        } else {
            cancelAnimation(height);
            height.value = withTiming(rest, { duration: 180 });
        }
        return () => cancelAnimation(height);
    }, [animating, color, duration, delay, rest, height]);
    const style = useAnimatedStyle(() => ({ height: height.value }));
    return (
        <Animated.View
            style={[{ width: BAR_WIDTH, backgroundColor: color }, style]}
        />
    );
}

/** 「正在播放」律动指示：三根竖条底部对齐、错相跳动；纯装饰、a11y 隐藏，含义由所在行的读屏名承载 */
export function PlayingIndicator({
    animating,
    color = 'onPrimarySoft',
}: PlayingIndicatorProps) {
    const colors = useColors();
    const barColor = colors[color];
    // 减弱动态时不跳动、静止在休止高度（避免 reduced-motion 下 withSequence 停在最小高度）
    const reduced = useReducedMotion();
    const shouldAnimate = animating && !reduced;
    return (
        <View
            style={styles.row}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
        >
            {BARS.map((bar, index) => (
                <Bar
                    key={index}
                    animating={shouldAnimate}
                    color={barColor}
                    duration={bar.duration}
                    delay={bar.delay}
                    rest={bar.rest}
                />
            ))}
        </View>
    );
}

const styles = StyleSheet.create({
    row: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        height: MAX_HEIGHT,
        gap: BAR_GAP,
    },
});
