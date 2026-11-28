import { useEffect } from 'react';
import Animated, {
    Easing,
    useAnimatedStyle,
    useSharedValue,
    withRepeat,
    withTiming,
} from 'react-native-reanimated';

import { iconSize, type Colors } from '@/design';

import { Icon } from './Icon';

interface SpinnerProps {
    size: keyof typeof iconSize;
    color: keyof Colors | (string & {});
}

/** 加载态旋转圈：无限匀速转（800ms 一圈是转速，非过渡时长）；尺寸/色由调用方给 */
export function Spinner({ size, color }: SpinnerProps) {
    const angle = useSharedValue(0);
    useEffect(() => {
        angle.value = withRepeat(
            withTiming(360, { duration: 800, easing: Easing.linear }),
            -1,
            false,
        );
    }, [angle]);
    const spinStyle = useAnimatedStyle(() => ({
        transform: [{ rotate: `${angle.value}deg` }],
    }));
    return (
        <Animated.View style={spinStyle}>
            <Icon name="loader-circle" size={size} color={color} />
        </Animated.View>
    );
}
