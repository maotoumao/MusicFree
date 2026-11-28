import { useCallback } from 'react';
import {
    useAnimatedStyle,
    useSharedValue,
    withTiming,
} from 'react-native-reanimated';

import { duration, easing, opacity } from '@/design';

/**
 * 统一按压反馈：opacity 1↔pressed + scale 1↔scale，同时同时长过渡（fast + standard）
 * 跟手（onPressIn/Out 触发，非 onPress 后）；Button/IconButton 共用，仅 scale 幅度不同
 * TODO RNGH 3.1 稳定版带原生 Touchable(activeOpacity+activeScale+animationDuration) 后可迁移、省掉此 hook
 */
export function usePressAnimation(scale: number, disabled = false) {
    // 0=常态 1=按下；单一 progress 驱动 opacity 与 scale，二者时序同步
    const progress = useSharedValue(0);
    // opacity 统一由此 worklet 出（含 disabled 变暗）：若 disabled 改用外层静态 opacity，
    // 会与 Reanimated 写入的 native opacity 争同一属性——条件移除 animatedStyle 不会重置已写值，静态值盖不过
    const animatedStyle = useAnimatedStyle(() => {
        const t = progress.value;
        return {
            opacity: disabled
                ? opacity.disabled
                : 1 - t * (1 - opacity.pressed),
            transform: [{ scale: 1 - t * (1 - scale) }],
        };
    });
    const onPressIn = useCallback(() => {
        progress.value = withTiming(1, {
            duration: duration.fast,
            easing: easing.standard,
        });
    }, [progress]);
    const onPressOut = useCallback(() => {
        progress.value = withTiming(0, {
            duration: duration.fast,
            easing: easing.standard,
        });
    }, [progress]);
    return { animatedStyle, onPressIn, onPressOut };
}
