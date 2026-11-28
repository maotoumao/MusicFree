/**
 * FullScreen 壳：铺满整屏的 overlay（纯壳，不懂业务；内容由注册组件渲染）
 * 与 Panel 同栈、同 presence 语义，差别只在几何与转场：整屏纯淡入淡出，无位移
 * 不吃安全区——整屏面是通铺的，边距交给内容按 insets 自理；也不定背景色，由内容自己铺满
 * 不随 covered 自淡：整屏不透明、靠 z 序即可，且被上层面板盖住时它本就该继续露在背后
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
    useAnimatedReaction,
    useAnimatedStyle,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { zIndex } from '@/design';

import { removePanel } from '../kernel/controller';
import { OverlayStatusProvider } from '../useOverlayStatus';

import { useOverlayTransition } from './useOverlayTransition';

import type { OverlayInstance } from '../kernel/types';

/** 进场进度越过此阈值即揭示重内容：重活推迟到滑动尾部渲染、hitch 被运动掩盖（与 Panel 同阈值） */
const ENTER_REVEAL_PROGRESS = 0.8;

export const FullScreen = memo(function FullScreenShell({
    instance,
    visible,
    active,
    raised,
}: {
    instance: OverlayInstance;
    visible: boolean;
    active: boolean;
    raised: boolean;
}) {
    const Component = instance.Component;
    const [entered, setEntered] = useState(false);
    // 内容层稳定读到 active/visible/entered：只在真值变化时换引用，避免无谓重渲染
    const status = useMemo(
        () => ({ active, visible, entered }),
        [active, visible, entered],
    );
    // 进出 presence：close 只把 instance.exiting 置真，这里驱 transition 退场后 removePanel 真卸载
    const onExited = useCallback(() => removePanel(instance.id), [instance.id]);
    // 滑动距离恒为窗口高度，不像 Panel 那样要等 onLayout 量 sheet，故挂载即可进场
    const present = !instance.exiting;
    const transition = useOverlayTransition({ present, onExited });
    // react 每帧被调，用 !previous 只在首次越阈时发一次；reduced-motion 下 progress 直接跳 1 也会触发
    useAnimatedReaction(
        () => transition.value > ENTER_REVEAL_PROGRESS,
        (revealed, previous) => {
            if (revealed && !previous) {
                scheduleOnRN(setEntered, true);
            }
        },
        [],
    );
    // 从未现身就被关（挂载即 exiting / open→close 同帧 / 父级首帧前级联关）→ 直接卸载：
    // 没有退场画面可播，且 useOverlayTransition 的进场守卫会让这种实例 onExited 永不触发而僵死占位
    const shownRef = useRef(false);
    if (present) {
        shownRef.current = true;
    }
    useEffect(() => {
        if (instance.exiting && !shownRef.current) {
            removePanel(instance.id);
        }
    }, [instance.exiting, instance.id]);
    const surfaceStyle = useAnimatedStyle(() => {
        return {
            opacity: transition.value,
        };
    }, []);
    return (
        <Animated.View
            collapsable={false}
            pointerEvents={active ? 'box-none' : 'none'}
            accessibilityElementsHidden={!active}
            importantForAccessibility={active ? 'auto' : 'no-hide-descendants'}
            style={[
                styles.root,
                { zIndex: raised ? zIndex.panel : zIndex.panelSuppressed },
                surfaceStyle,
            ]}
        >
            <OverlayStatusProvider value={status}>
                <Component payload={instance.payload} close={instance.close} />
            </OverlayStatusProvider>
        </Animated.View>
    );
});

const styles = StyleSheet.create({
    root: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
    },
});
