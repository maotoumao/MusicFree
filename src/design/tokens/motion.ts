// reanimated 的 Easing（worklet 版）：easing 用于 reanimated withTiming，必须是 worklet；
// react-native 的 Easing 不是 worklet，传给 withTiming 会「easing function is not a worklet」报错
import { Easing } from 'react-native-reanimated';

/** 动画时长（ms） */
export const duration = {
    fast: 150,
    base: 250,
    slow: 400,
} as const;

/** 缓动曲线 */
export const easing = {
    /** 通用进出 */
    standard: Easing.bezier(0.2, 0, 0, 1),
    /** 进入（减速） */
    decelerate: Easing.out(Easing.cubic),
    /** 退出（加速） */
    accelerate: Easing.in(Easing.cubic),
} as const;

/** 按压缩放幅度 */
export const pressScale = {
    /** Button 三变体：文字控件缩放不宜过大，避免文字抖动 */
    subtle: 0.97,
    /** IconButton：纯图标可更明显、触感更跳 */
    compact: 0.9,
} as const;
