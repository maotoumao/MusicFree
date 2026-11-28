/**
 * overlay 进出 presence（命令式）：用共享值驱 progress，绕开 reanimated 声明式
 * entering/exiting 在 New Arch/Fabric 下浮层挂载/卸载那帧整屏白闪的坑
 * - present=true：进场 0→1
 * - present 翻 false：退场 1→0，播完调 onExited（供 presence 真正卸载）
 * withTiming 自动尊重全局 ReducedMotion（providers 的 ReducedMotionConfig）
 * onExited 须稳定引用（useCallback / 或不传）——它进依赖数组
 */
import { useEffect, useRef } from 'react';
import {
    useSharedValue,
    withTiming,
    type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { duration, easing } from '@/design';

export function useOverlayTransition({
    present,
    onExited,
}: {
    present: boolean;
    onExited?: () => void;
}): SharedValue<number> {
    const progress = useSharedValue(0);
    // 是否曾进场：没进场过（如调用方延迟到就绪才置 present）就 present=false 不该误触发退场卸载
    const hasStartedEntrance = useRef(false);
    useEffect(() => {
        if (present) {
            hasStartedEntrance.current = true;
            progress.value = withTiming(1, {
                duration: duration.base,
                easing: easing.standard,
            });
            return;
        }
        if (!hasStartedEntrance.current) {
            return;
        }
        progress.value = withTiming(
            0,
            { duration: duration.base, easing: easing.standard },
            finished => {
                if (finished && onExited) {
                    scheduleOnRN(onExited);
                }
            },
        );
    }, [present, progress, onExited]);
    return progress;
}
