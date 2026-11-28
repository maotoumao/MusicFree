/**
 * 通用竖向滑杆：垂直拖动调值（顶 = max、底 = min），支持受控值、step 吸附、双极填充（baseline）、
 * 命中区 ≥44dp 与无障碍调节。纯 UI，颜色默认取自 token
 * 与横向 Slider 并列；因坐标轴与双极填充差异，交互逻辑自持、不复用横向播放条内核 useSlider
 */
import { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import {
    StyleSheet,
    View,
    type LayoutChangeEvent,
    type StyleProp,
    type ViewStyle,
} from 'react-native';
import {
    GestureDetector,
    useExclusiveGestures,
    usePanGesture,
    useTapGesture,
} from 'react-native-gesture-handler';
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { layout, radius as radiusTokens, useColors } from '@/design';

/** 视觉常量（无对应 token） */
const TRACK_THICKNESS = 4;
const THUMB_SIZE = 18;
const DEFAULT_HEIGHT = 160;
/** 基准线比轨道两侧各宽出的量 */
const BASELINE_OVERHANG = 10;

/** 命中区 y → 0..1 轨道比例（顶 y=0 → 1=max，底 → 0=min） */
function fracAtY(y: number, size: number) {
    'worklet';
    const s = size || 1;
    return Math.max(0, Math.min(1, 1 - y / s));
}

/** 把值吸附到 step 网格并钳制在 [min,max] */
function snapToStep(value: number, step: number, min: number, max: number) {
    const snapped = Math.round((value - min) / step) * step + min;
    return Math.min(max, Math.max(min, snapped));
}

export interface VerticalSliderProps {
    /** 当前值（受控）；拖动时内部接管，忽略外部 value 直到松手 */
    value: number;
    /** 上限 */
    max: number;
    /** 下限，默认 0 */
    min?: number;
    /** 吸附步长（值单位）；不传 = 连续 */
    step?: number;
    /** 填充基准值：填充从此值延伸到当前值，默认 min（普通底部填充）；设中间值即双极 */
    baseline?: number;

    /** 拖动实时值 */
    onChange?: (value: number) => void;
    /** 开始交互 */
    onChangeStart?: () => void;
    /** 松手或点按后提交最终值（受控约定：消费方应在此乐观更新 value，避免回跳） */
    onChangeEnd?: (value: number) => void;
    /** 拖动被父手势抢占取消：未提交，消费方应清预览态 */
    onChangeCancel?: () => void;
    /** 禁用交互，纯展示 */
    disabled?: boolean;

    /** 轨道长度（竖直方向），默认 160 */
    height?: number;
    /** 轨道粗细，默认 4 */
    trackThickness?: number;
    /** 命中区宽度（视觉细但可点），默认 hitTarget 44 */
    hitWidth?: number;
    /** 圆角，默认 radius.full */
    radius?: number;
    /** 轨道底色，默认 surfaceVariant */
    trackColor?: string;
    /** 已选填充色，默认 primary */
    fillColor?: string;
    /** 在 baseline 处画一条基准线（如 EQ 零点），默认 false */
    showBaseline?: boolean;
    /** 拇指显隐：常显 / 仅触摸 / 从不，默认 always */
    thumb?: 'always' | 'active' | 'never';
    /** 拇指色，默认 fillColor */
    thumbColor?: string;
    /** 拇指直径，默认 18 */
    thumbSize?: number;
    /** 拖动时拇指直径，默认 thumbSize + 4 */
    activeThumbSize?: number;

    /** 无障碍增减步长，默认 step ?? (max−min)/20 */
    accessibilityStep?: number;
    accessibilityLabel?: string;
    /** 无障碍朗读文案（如 "+6 dB"）；不传则朗读百分比 */
    accessibilityValueText?: string;
    style?: StyleProp<ViewStyle>;
}

/**
 * 竖向可拖动滑杆：垂直拖动 / 点按定位 / step 吸附 / 双极填充 / 命中区 ≥44dp / 无障碍调节
 * 拖动中组件内部接管位置，松手经 onChangeEnd 提交；消费方乐观更新 value
 */
export const VerticalSlider = memo(function VerticalSliderBase({
    value,
    max,
    min = 0,
    step,
    baseline,
    onChange,
    onChangeStart,
    onChangeEnd,
    onChangeCancel,
    disabled = false,
    height = DEFAULT_HEIGHT,
    trackThickness = TRACK_THICKNESS,
    hitWidth = layout.hitTarget,
    radius: radiusProp,
    trackColor,
    fillColor,
    showBaseline = false,
    thumb = 'always',
    thumbColor,
    thumbSize = THUMB_SIZE,
    activeThumbSize,
    accessibilityStep,
    accessibilityLabel,
    accessibilityValueText,
    style,
}: VerticalSliderProps) {
    const colors = useColors();
    const rad = radiusProp ?? radiusTokens.full;
    const trackBg = trackColor ?? colors.surfaceVariant;
    const fill = fillColor ?? colors.primary;
    const thumbBg = thumbColor ?? fill;
    const activeSize = activeThumbSize ?? thumbSize + 4;

    // 有效值域校验：值域非有限或 max<=min 时禁用交互，比例恒为 0
    const hasRange = Number.isFinite(min) && Number.isFinite(max) && max > min;
    const range = hasRange ? max - min : 0;
    const clampValue = useCallback(
        (v: number) => (hasRange ? Math.min(max, Math.max(min, v)) : min),
        [hasRange, max, min],
    );
    const safeValue = clampValue(Number.isFinite(value) ? value : min);
    const targetFrac = hasRange ? (safeValue - min) / range : 0;
    const baselineFrac = hasRange
        ? Math.min(1, Math.max(0, ((baseline ?? min) - min) / range))
        : 0;
    const interactive = !disabled && hasRange;
    // step 归一化：有限、正、不超过 range，否则 0 = 不吸附
    const effectiveStep =
        step != null && Number.isFinite(step) && step > 0 && hasRange
            ? Math.min(step, range)
            : 0;
    const stepFraction = effectiveStep > 0 ? effectiveStep / range : 0;

    const trackSize = useSharedValue(0);
    const posFrac = useSharedValue(targetFrac);
    /** 受控值对应位置：取消时回落 */
    const controlledFrac = useSharedValue(targetFrac);
    /** 0..1 拖动进度：驱动拇指放大 / 'active' 淡入 */
    const dragProg = useSharedValue(0);
    const stepFrac = useSharedValue(stepFraction);
    /** pan 是否真正激活过：区分「静止点按令 pan FAILED」与「真拖动被抢占」，避免点按误触发 cancel */
    const activated = useSharedValue(false);
    /** 上次已派发给 JS 的比例：step 吸附后同值不重复跨线程派发 */
    const lastReported = useSharedValue(-1);
    useEffect(() => {
        stepFrac.value = stepFraction;
    }, [stepFraction, stepFrac]);

    const draggingRef = useRef(false);

    // 回调经 latest ref 读取最新值：内联回调不纳入 worklet 依赖，handler 保持稳定
    const latest = useRef({ min, range, hasRange, step: effectiveStep });
    latest.current = { min, range, hasRange, step: effectiveStep };
    const callbacks = useRef({
        onChange,
        onChangeStart,
        onChangeEnd,
        onChangeCancel,
    });
    callbacks.current = {
        onChange,
        onChangeStart,
        onChangeEnd,
        onChangeCancel,
    };

    // 外部 value → posFrac（未拖动时跟随）；controlledFrac 始终跟随，供取消回落
    useEffect(() => {
        controlledFrac.value = targetFrac;
        if (draggingRef.current) {
            return;
        }
        posFrac.value = targetFrac;
    }, [targetFrac, posFrac, controlledFrac]);

    /** 0..1 → 值（有 step 则吸附，再钳制） */
    const fracToValue = useCallback((f: number) => {
        const s = latest.current;
        if (!s.hasRange) {
            return s.min;
        }
        const raw = s.min + f * s.range;
        return s.step > 0
            ? snapToStep(raw, s.step, s.min, s.min + s.range)
            : raw;
    }, []);
    const beginInteraction = useCallback(() => {
        draggingRef.current = true;
        callbacks.current.onChangeStart?.();
    }, []);
    const reportChange = useCallback(
        (f: number) => {
            callbacks.current.onChange?.(fracToValue(f));
        },
        [fracToValue],
    );
    const commitInteraction = useCallback(
        (f: number) => {
            draggingRef.current = false;
            callbacks.current.onChangeEnd?.(fracToValue(f));
        },
        [fracToValue],
    );
    // posFrac 回滚在 UI worklet 内完成（见 onFinalize），此处仅清拖动态并通知消费方
    const cancelInteraction = useCallback(() => {
        draggingRef.current = false;
        callbacks.current.onChangeCancel?.();
    }, []);

    const pan = usePanGesture(
        useMemo<NonNullable<Parameters<typeof usePanGesture>[0]>>(
            () => ({
                enabled: interactive,
                minDistance: 0,
                onActivate: e => {
                    'worklet';
                    let f = fracAtY(e.y, trackSize.value);
                    if (stepFrac.value > 0) {
                        f = Math.round(f / stepFrac.value) * stepFrac.value;
                    }
                    f = Math.max(0, Math.min(1, f));
                    posFrac.value = f;
                    lastReported.value = f;
                    activated.value = true;
                    dragProg.value = withTiming(1, { duration: 120 });
                    scheduleOnRN(beginInteraction);
                    scheduleOnRN(reportChange, f);
                },
                onUpdate: e => {
                    'worklet';
                    let f = fracAtY(e.y, trackSize.value);
                    if (stepFrac.value > 0) {
                        f = Math.round(f / stepFrac.value) * stepFrac.value;
                    }
                    f = Math.max(0, Math.min(1, f));
                    posFrac.value = f;
                    // step 吸附后同值不重复派发到 JS 线程
                    if (f !== lastReported.value) {
                        lastReported.value = f;
                        scheduleOnRN(reportChange, f);
                    }
                },
                onDeactivate: e => {
                    'worklet';
                    if (!e.canceled) {
                        scheduleOnRN(commitInteraction, posFrac.value);
                    }
                },
                onFinalize: e => {
                    'worklet';
                    dragProg.value = withTiming(0, { duration: 160 });
                    // 仅「真拖动被抢占」才回滚（静止点按令 pan FAILED、activated=false，不误触发 cancel）
                    if (e.canceled && activated.value) {
                        posFrac.value = controlledFrac.value;
                        scheduleOnRN(cancelInteraction);
                    }
                    activated.value = false;
                },
            }),
            [
                interactive,
                posFrac,
                controlledFrac,
                dragProg,
                stepFrac,
                trackSize,
                activated,
                lastReported,
                beginInteraction,
                reportChange,
                commitInteraction,
                cancelInteraction,
            ],
        ),
    );
    const tap = useTapGesture(
        useMemo<NonNullable<Parameters<typeof useTapGesture>[0]>>(
            () => ({
                enabled: interactive,
                maxDistance: 16,
                onActivate: e => {
                    'worklet';
                    let f = fracAtY(e.y, trackSize.value);
                    if (stepFrac.value > 0) {
                        f = Math.round(f / stepFrac.value) * stepFrac.value;
                    }
                    posFrac.value = Math.max(0, Math.min(1, f));
                    scheduleOnRN(beginInteraction);
                    scheduleOnRN(commitInteraction, posFrac.value);
                },
            }),
            [
                interactive,
                posFrac,
                stepFrac,
                trackSize,
                beginInteraction,
                commitInteraction,
            ],
        ),
    );
    const gesture = useExclusiveGestures(pan, tap);

    const onLayout = useCallback(
        (e: LayoutChangeEvent) => {
            trackSize.value = e.nativeEvent.layout.height;
        },
        [trackSize],
    );

    const rawStep = accessibilityStep ?? step ?? range / 20;
    const a11yStep =
        Number.isFinite(rawStep) && rawStep > 0
            ? rawStep
            : Math.max(range / 20, 1);
    const onAccessibilityAction = (e: {
        nativeEvent: { actionName: string };
    }) => {
        if (!interactive) {
            return;
        }
        const name = e.nativeEvent.actionName;
        if (name !== 'increment' && name !== 'decrement') {
            return;
        }
        const next = clampValue(
            name === 'increment' ? safeValue + a11yStep : safeValue - a11yStep,
        );
        callbacks.current.onChangeEnd?.(
            effectiveStep > 0
                ? snapToStep(next, effectiveStep, min, max)
                : next,
        );
    };

    const fillStyle = useAnimatedStyle(() => {
        const p = posFrac.value;
        const lo = Math.min(p, baselineFrac);
        const hi = Math.max(p, baselineFrac);
        const size = trackSize.value;
        return { bottom: lo * size, height: (hi - lo) * size };
    });
    const thumbWrapStyle = useAnimatedStyle(() => ({
        transform: [{ translateY: -(posFrac.value * trackSize.value) }],
        opacity:
            thumb === 'never' ? 0 : thumb === 'active' ? dragProg.value : 1,
    }));
    const dotStyle = useAnimatedStyle(() => {
        const s = thumbSize + (activeSize - thumbSize) * dragProg.value;
        return {
            width: s,
            height: s,
            borderRadius: s / 2,
            marginBottom: -s / 2,
        };
    });
    // 基准线：随实测高度定位，中心对齐数值坐标（减半个 hairline）
    const baselineStyle = useAnimatedStyle(() => ({
        bottom: baselineFrac * trackSize.value - StyleSheet.hairlineWidth / 2,
    }));
    const baselineWidth = trackThickness + BASELINE_OVERHANG;

    return (
        <GestureDetector gesture={gesture}>
            <View
                style={[styles.hit, { width: hitWidth, height }, style]}
                onLayout={onLayout}
                accessible
                accessibilityRole="adjustable"
                accessibilityLabel={accessibilityLabel}
                accessibilityState={{ disabled: !interactive }}
                accessibilityValue={
                    hasRange
                        ? {
                              min: 0,
                              max: 100,
                              now: Math.round(targetFrac * 100),
                              ...(accessibilityValueText != null
                                  ? { text: accessibilityValueText }
                                  : {}),
                          }
                        : undefined
                }
                accessibilityActions={[
                    { name: 'increment' },
                    { name: 'decrement' },
                ]}
                onAccessibilityAction={onAccessibilityAction}
            >
                <View
                    style={[
                        styles.track,
                        {
                            width: trackThickness,
                            borderRadius: rad,
                            backgroundColor: trackBg,
                        },
                    ]}
                >
                    <Animated.View
                        style={[
                            styles.fill,
                            fillStyle,
                            { borderRadius: rad, backgroundColor: fill },
                        ]}
                    />
                </View>
                {showBaseline ? (
                    <Animated.View
                        pointerEvents="none"
                        style={[
                            styles.baseline,
                            baselineStyle,
                            {
                                width: baselineWidth,
                                marginLeft: -baselineWidth / 2,
                                backgroundColor: colors.border,
                            },
                        ]}
                    />
                ) : null}
                {thumb !== 'never' ? (
                    <Animated.View
                        pointerEvents="none"
                        style={[styles.thumbWrap, thumbWrapStyle]}
                    >
                        <Animated.View
                            style={[dotStyle, { backgroundColor: thumbBg }]}
                        />
                    </Animated.View>
                ) : null}
            </View>
        </GestureDetector>
    );
});

const styles = StyleSheet.create({
    hit: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    track: {
        height: '100%',
        overflow: 'hidden',
    },
    fill: {
        position: 'absolute',
        left: 0,
        right: 0,
    },
    baseline: {
        position: 'absolute',
        left: '50%',
        height: StyleSheet.hairlineWidth,
    },
    thumbWrap: {
        position: 'absolute',
        top: 0,
        bottom: 0,
        left: 0,
        right: 0,
        alignItems: 'center',
        justifyContent: 'flex-end',
    },
});
