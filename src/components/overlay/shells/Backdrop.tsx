/**
 * 共享 backdrop：常驻挂载，透明度随 visible 命令式淡入淡出（绕开声明式 FadeIn/Out 在 New Arch/Fabric 的白闪）
 * OverlayHost 只渲一层、盖在最顶「未退场」overlay 之下；能否点关由 host 决定
 * 对读屏隐藏（装饰性；可交互的关闭走各 overlay 的按钮/返回键）
 *
 * **必须自己挂一个 RNGH handler，否则遮罩拦不住底下的 RNGH 手势**（SeekBar / Slider /
 * ColorPicker 的拖动都是 `GestureDetector`）。安卓侧的机制在
 * `GestureHandlerOrchestrator.shouldHandlerlessViewBecomeTouchTarget`：没挂 handler、
 * 自身背景又透明的 ViewGroup 不成为触摸目标，于是 handler 提取继续往子树下穿，
 * 把底下 SeekBar 的 pan 提了出来。旧实现是 `Pressable` + 背景色在内层子 View 上，正好命中这条。
 * 挂上 handler 后提取在本层短路（`extractGestureHandlers` 逆序遍历、首个命中即返回），
 * 底下的手势压根不进入仲裁。iOS 侧 UIKit 的 hitTest 天然返回最顶层 view，本来就没这个问题
 *
 * 命中壳与视觉层**必须分开**：`canReceiveEvents` 要求 `alpha ≥ 0.1`
 * （`RNGestureHandlerRootHelper` 把 `minimumAlphaForTraversal` 设成 0.1f），
 * 把淡入淡出挂在命中节点上会让它在淡入首段 / 淡出末段被遍历跳过、那几帧漏点。
 * 故外层命中壳恒不透明，只有内层装饰层淡入淡出
 */
import { BlurView } from 'expo-blur';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { useColors, zIndex } from '@/design';

import { useOverlayTransition } from './useOverlayTransition';

import type { RefObject } from 'react';
import type { View as RNView } from 'react-native';

const BLUR_INTENSITY = 56;

export function Backdrop({
    visible,
    onDismiss,
    effect,
    blurTarget,
}: {
    visible: boolean;
    onDismiss?: () => void;
    effect?: 'blur';
    blurTarget: RefObject<RNView | null>;
}) {
    const colors = useColors();
    // 遮挡（拦触摸）比可见多撑一段：淡出没播完前继续挡，别让退场期的触摸穿到底层页面
    const [shielding, setShielding] = useState(visible);
    useEffect(() => {
        if (visible) {
            setShielding(true);
        }
    }, [visible]);
    const stopShield = useCallback(() => setShielding(false), []);
    // 常驻不卸载；仅随 visible 淡入淡出，淡出播完（onExited）才撤下遮挡
    const progress = useOverlayTransition({
        present: visible,
        onExited: stopShield,
    });
    const fade = useAnimatedStyle(() => ({ opacity: progress.value }));

    /*
     * 只要一个 Tap：拦触摸靠的是「本层挂了 handler」这件事本身（见文件头），不是靠抢仲裁
     *
     * `onEnd` 会被 reanimated 的 babel 插件自动 worklet 化（产物里带 `__workletHash`），
     * 所以它跑在 UI runtime 上——`onDismiss` 是 JS 侧闭包，直接调会抛
     * 「Tried to synchronously call a Remote Function」，必须经 `scheduleOnRN` 回 JS 线程
     */
    const gesture = useMemo(
        () =>
            Gesture.Tap()
                // Tap 两端默认 maxDuration 都是 500ms（安卓 DEFAULT_MAX_DURATION_MS、
                // iOS defaultMaxDuration=0.5），超时走 BEGAN → FAILED，而 END 回调只在
                // `oldState === ACTIVE` 时才跑——于是慢一点的一次点按**静默不关**，
                // 连 success=false 都收不到。旧的 Pressable 没传 onLongPress，松手必调 onPress、
                // 与按压时长无关，故这里要把上限放开才算等价。别用 MAX_SAFE_INTEGER：
                // 安卓侧是 `config.getInt(KEY_MAX_DURATION_MS)`，会溢出 Int
                .maxDuration(30_000)
                .onEnd((_event, success) => {
                    if (success && visible && onDismiss) {
                        scheduleOnRN(onDismiss);
                    }
                }),
        [visible, onDismiss],
    );

    if (!visible && !shielding) {
        return null;
    }

    return (
        <GestureDetector gesture={gesture}>
            {/* 命中壳：恒不透明，只负责挂 handler 与拦触摸，本身不画任何东西 */}
            <View
                style={[StyleSheet.absoluteFill, { zIndex: zIndex.backdrop }]}
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
            >
                <Animated.View
                    style={[StyleSheet.absoluteFill, fade]}
                    pointerEvents="none"
                >
                    {effect === 'blur' ? (
                        <BlurView
                            blurTarget={blurTarget}
                            blurMethod="dimezisBlurViewSdk31Plus"
                            intensity={BLUR_INTENSITY}
                            tint="dark"
                            style={StyleSheet.absoluteFill}
                        />
                    ) : null}
                    <View
                        style={[
                            StyleSheet.absoluteFill,
                            {
                                backgroundColor:
                                    effect === 'blur'
                                        ? colors.coverScrim
                                        : colors.mask,
                            },
                        ]}
                    />
                </Animated.View>
            </View>
        </GestureDetector>
    );
}
