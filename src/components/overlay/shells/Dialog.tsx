/**
 * Dialog 壳：居中卡片（纯壳，不懂业务；内容由注册组件渲染）
 * backdrop 由 OverlayHost 共享层提供（避免与 panel 双层叠暗）；根节点 box-none 让空白点击落到 backdrop
 * 进出走命令式 useAnimatedStyle（scale pop + 淡入）+ presence：close 只标 instance.exiting、
 * 壳播完退场再 removeDialog 真卸载——绕开 reanimated 声明式 entering/exiting 在 New Arch/Fabric 的整屏白闪
 * 退场中（exiting）根节点 pointerEvents=none：正在淡出的卡片不再吃点击（避免二次误触其上按钮）
 * 无障碍：卡片 accessibilityViewIsModal，底层 app 由 providers 读屏隔离层屏蔽
 */
import { memo, useCallback, useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';

import { elevation, layout, radius, space, useColors, zIndex } from '@/design';

import { removeDialog } from '../kernel/controller';

import { useOverlayTransition } from './useOverlayTransition';

import type { OverlayInstance } from '../kernel/types';

export const Dialog = memo(function DialogShell({
    instance,
}: {
    instance: OverlayInstance;
}) {
    const colors = useColors();
    const Component = instance.Component;
    const exiting = !!instance.exiting;
    // 进出 presence：close 只把 instance.exiting 置真，这里驱 transition 退场后 removeDialog 真卸载
    const onExited = useCallback(
        () => removeDialog(instance.id),
        [instance.id],
    );
    const present = !exiting;
    const transition = useOverlayTransition({ present, onExited });
    // 从未现身就被关（open→close 同帧）：直接卸载——没有退场画面可播，
    // 且 useOverlayTransition 的 entered 守卫会让这种实例 onExited 永不触发而僵死占位
    const shownRef = useRef(false);
    if (present) {
        shownRef.current = true;
    }
    useEffect(() => {
        if (exiting && !shownRef.current) {
            removeDialog(instance.id);
        }
    }, [exiting, instance.id]);
    // scale pop（0.92→1）+ 淡入淡出；整块作为单个 reanimated 节点进出
    const popStyle = useAnimatedStyle(() => ({
        opacity: transition.value,
        transform: [{ scale: 0.92 + 0.08 * transition.value }],
    }));
    return (
        // 根节点自身 animated + collapsable={false}：整块 dialog 作为一个 reanimated 节点进出
        <Animated.View
            collapsable={false}
            pointerEvents={exiting ? 'none' : 'box-none'}
            // 整棵子树（含 elevation 阴影）合成为一个 alpha 层随淡入淡出一起过渡；
            // 否则 Android native elevation 阴影不参与 alpha，会先满强度闪出
            needsOffscreenAlphaCompositing
            style={[styles.root, popStyle]}
        >
            <View
                accessibilityViewIsModal
                style={[
                    styles.card,
                    elevation.lg,
                    {
                        backgroundColor: colors.overlaySurface,
                        shadowColor: colors.shadow,
                    },
                ]}
            >
                <Component payload={instance.payload} close={instance.close} />
            </View>
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
        zIndex: zIndex.modal,
        alignItems: 'center',
        justifyContent: 'center',
        padding: space.xl,
    },
    card: {
        width: '100%',
        maxWidth: layout.dialogMaxWidth,
        borderRadius: radius.lg,
        padding: space.xl,
    },
});
