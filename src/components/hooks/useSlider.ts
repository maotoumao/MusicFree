/**
 * 滑杆交互内核：处理命中区手势、值域映射、step 吸附和无障碍
 * 供 Slider 与 SeekBar 复用；仅提供手势、共享值和 a11y，轨道、填充和拇指由组件呈现
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type LayoutChangeEvent } from 'react-native';
import {
    useExclusiveGestures,
    usePanGesture,
    useTapGesture,
} from 'react-native-gesture-handler';
import { useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

/** 将命中区的 x 坐标转换为 0..1 的轨道比例 */
function fracAtX(x: number, width: number) {
    'worklet';
    const w = width || 1;
    return Math.max(0, Math.min(1, x / w));
}

/** 把值吸附到 step 网格并钳制在 [min,max] */
function snapToStep(value: number, step: number, min: number, max: number) {
    const snapped = Math.round((value - min) / step) * step + min;
    return Math.min(max, Math.max(min, snapped));
}

export interface UseSliderParams {
    /** 当前值（受控）；拖动时内部接管，忽略外部 value 直到松手 */
    value: number;
    /** 上限 */
    max: number;
    /** 下限，默认 0 */
    min?: number;
    /** 吸附步长（值单位）；不传=连续 */
    step?: number;
    /** 拖动实时值 */
    onChange?: (value: number) => void;
    /** 开始交互 */
    onChangeStart?: () => void;
    /** 松手或点按后提交最终值 */
    onChangeEnd?: (value: number) => void;
    /** 被父手势抢占取消：未提交，消费方应清预览态 */
    onChangeCancel?: () => void;
    /** 禁用交互，纯展示 */
    disabled?: boolean;
    /** 无障碍增减步长，默认 step ?? (max−min)/20 */
    accessibilityStep?: number;
    accessibilityLabel?: string;
    /** 无障碍朗读文案（如 "60%" / "1:12"）；不传则朗读百分比 */
    accessibilityValueText?: string;
}

/**
 * 返回滑杆交互所需的机制：`gesture`、`onLayout` 和 `accessibility` 挂到命中容器，
 * `posFrac`、`dragProg` 和 `trackWidth` 驱动呈现层动画，`valueToFraction` 供静态段（如缓冲）换算
 */
export function useSlider({
    value,
    max,
    min = 0,
    step,
    onChange,
    onChangeStart,
    onChangeEnd,
    onChangeCancel,
    disabled = false,
    accessibilityStep,
    accessibilityLabel,
    accessibilityValueText,
}: UseSliderParams) {
    // 有效值域校验：值域非有限或 max<=min 时禁用交互，比例恒为 0
    const hasRange = Number.isFinite(min) && Number.isFinite(max) && max > min;
    const range = hasRange ? max - min : 0;
    const clampValue = (v: number) =>
        hasRange ? Math.min(max, Math.max(min, v)) : min;
    const safeValue = clampValue(Number.isFinite(value) ? value : min);
    const targetFrac = hasRange ? (safeValue - min) / range : 0;
    const interactive = !disabled && hasRange;
    // step 归一化：有限、正、且不超过 range，否则 0=不吸附（NaN/越界会污染 posFrac 与回调）
    const effectiveStep =
        step != null && Number.isFinite(step) && step > 0 && hasRange
            ? Math.min(step, range)
            : 0;
    // 将 step 转为 0..1 比例网格；0 表示不吸附（worklet 在 UI 线程读取）
    const stepFraction = effectiveStep > 0 ? effectiveStep / range : 0;

    const trackWidth = useSharedValue(0);
    const posFrac = useSharedValue(targetFrac);
    /** 受控值对应的 0..1 位置：取消时回落到它 */
    const controlledFrac = useSharedValue(targetFrac);
    /** 0..1 拖动进度：驱动拇指放大 / 'active' 淡入 */
    const dragProg = useSharedValue(0);
    const stepFrac = useSharedValue(stepFraction);
    useEffect(() => {
        stepFrac.value = stepFraction;
    }, [stepFraction, stepFrac]);

    const draggingRef = useRef(false);
    const [dragging, setDragging] = useState(false);

    // 回调通过 latest ref 读取最新值：内联回调不纳入 worklet 依赖，拖动中回调可变而 handler 保持稳定
    const latest = useRef({
        min,
        range,
        hasRange,
        step: effectiveStep,
        onChange,
        onChangeStart,
        onChangeEnd,
        onChangeCancel,
    });
    latest.current = {
        min,
        range,
        hasRange,
        step: effectiveStep,
        onChange,
        onChangeStart,
        onChangeEnd,
        onChangeCancel,
    };

    // 外部 value → posFrac（未拖动时跟随）；controlledFrac 始终跟随，供取消时回落
    useEffect(() => {
        controlledFrac.value = targetFrac;
        if (draggingRef.current) {
            return;
        }
        posFrac.value = targetFrac;
    }, [targetFrac, posFrac, controlledFrac]);

    /** 0..1 → 值（有 step 则吸附，再钳制） */
    const fracToValue = (f: number) => {
        const s = latest.current;
        if (!s.hasRange) {
            return s.min;
        }
        const raw = s.min + f * s.range;
        return s.step && s.step > 0
            ? snapToStep(raw, s.step, s.min, s.min + s.range)
            : raw;
    };
    const beginInteraction = useCallback(() => {
        draggingRef.current = true;
        setDragging(true);
        latest.current.onChangeStart?.();
    }, []);
    const reportChange = useCallback((f: number) => {
        latest.current.onChange?.(fracToValue(f));
    }, []);
    const commitInteraction = useCallback((f: number) => {
        draggingRef.current = false;
        setDragging(false);
        latest.current.onChangeEnd?.(fracToValue(f));
    }, []);
    const cancelInteraction = useCallback(() => {
        // 被父手势抢占或取消：不提交中间值，位置回落到受控值并通知消费方清理预览态
        draggingRef.current = false;
        setDragging(false);
        posFrac.value = controlledFrac.value;
        latest.current.onChangeCancel?.();
    }, [posFrac, controlledFrac]);

    // 手势回调在 UI 线程运行，直接更新 posFrac；业务回调通过 scheduleOnRN 派发到 JS 线程
    // config 用 useMemo 稳住身份：内联字面量每渲染新身份会让 RNGH 每渲染向原生重下发手势配置（播放进度刷新 / 拖动热路径）；依赖全稳定，仅 interactive 翻转才重建
    const pan = usePanGesture(
        useMemo<NonNullable<Parameters<typeof usePanGesture>[0]>>(
            () => ({
                enabled: interactive,
                minDistance: 0,
                onActivate: e => {
                    'worklet';
                    let f = fracAtX(e.x, trackWidth.value);
                    if (stepFrac.value > 0) {
                        f = Math.round(f / stepFrac.value) * stepFrac.value;
                    }
                    posFrac.value = Math.max(0, Math.min(1, f));
                    dragProg.value = withTiming(1, { duration: 120 });
                    scheduleOnRN(beginInteraction);
                    scheduleOnRN(reportChange, posFrac.value);
                },
                onUpdate: e => {
                    'worklet';
                    let f = fracAtX(e.x, trackWidth.value);
                    if (stepFrac.value > 0) {
                        f = Math.round(f / stepFrac.value) * stepFrac.value;
                    }
                    posFrac.value = Math.max(0, Math.min(1, f));
                    scheduleOnRN(reportChange, posFrac.value);
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
                    if (e.canceled) {
                        scheduleOnRN(cancelInteraction);
                    }
                },
            }),
            [
                interactive,
                posFrac,
                dragProg,
                stepFrac,
                trackWidth,
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
                    let f = fracAtX(e.x, trackWidth.value);
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
                trackWidth,
                beginInteraction,
                commitInteraction,
            ],
        ),
    );
    const gesture = useExclusiveGestures(pan, tap);

    const onLayout = useCallback(
        (e: LayoutChangeEvent) => {
            trackWidth.value = e.nativeEvent.layout.width;
        },
        [trackWidth],
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
        latest.current.onChangeEnd?.(
            effectiveStep > 0
                ? snapToStep(next, effectiveStep, min, max)
                : next,
        );
    };

    /** 值 → 0..1 比例（缓冲等静态段换算；降级或非有限时恒 0） */
    const valueToFraction = useCallback(
        (v: number) => {
            if (!hasRange || !Number.isFinite(v)) {
                return 0;
            }
            return Math.min(1, Math.max(0, (v - min) / range));
        },
        [hasRange, min, range],
    );

    return {
        gesture,
        onLayout,
        interactive,
        dragging,
        /** 钳制后的当前值（供 renderThumb / 展示） */
        value: safeValue,
        valueToFraction,
        posFrac,
        dragProg,
        trackWidth,
        /** 无障碍属性包：展开到命中容器 */
        accessibility: {
            accessible: true as const,
            accessibilityRole: 'adjustable' as const,
            accessibilityLabel,
            accessibilityState: { disabled: !interactive },
            // 归一化到 0..100 整数：小数值域在 Android RangeInfo 会被取整丢失，统一按百分比表达
            accessibilityValue: hasRange
                ? {
                      min: 0,
                      max: 100,
                      now: Math.round(targetFrac * 100),
                      ...(accessibilityValueText != null
                          ? { text: accessibilityValueText }
                          : {}),
                  }
                : undefined,
            accessibilityActions: [
                { name: 'increment' },
                { name: 'decrement' },
            ],
            onAccessibilityAction,
        },
    };
}
