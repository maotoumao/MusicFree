import { useCallback } from 'react';
import {
    useAnimatedStyle,
    useSharedValue,
    withTiming,
} from 'react-native-reanimated';

import { duration, easing } from '@/design';

/**
 * 按压时通过 withTiming 将覆盖层透明度从 0 动画到 1，释放时恢复到 0
 * 返回 overlayStyle 及 onPressIn/onPressOut 回调，供铺满整行的 absoluteFill Animated.View 使用
 */
export function usePressFade() {
    const progress = useSharedValue(0);
    const overlayStyle = useAnimatedStyle(() => ({ opacity: progress.value }));
    const onPressIn = useCallback(() => {
        progress.value = withTiming(1, {
            duration: duration.base,
            easing: easing.standard,
        });
    }, [progress]);
    const onPressOut = useCallback(() => {
        progress.value = withTiming(0, {
            duration: duration.base,
            easing: easing.standard,
        });
    }, [progress]);
    return { overlayStyle, onPressIn, onPressOut };
}
