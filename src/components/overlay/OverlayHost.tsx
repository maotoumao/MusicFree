/**
 * overlay 渲染根宿主：绝对定位盖住导航（含 app 底部条），渲染 overlay store（panel 栈 / dialog / toast）
 * 不是通用组件穿越器（命令式 store 驱动，非声明式 teleport）
 * 同一个栈按 kind 选壳：'panel' 走抽屉 sheet，'fullscreen' 走铺满整屏
 * backdrop 只渲一层、盖在最顶可见 overlay（dialog ?? 栈顶 panel）之下——避免双层叠暗
 *
 * **渲染顺序是一条不变量，且两个平台各依赖它的一半**：backdrop 必须渲在 panels **之前**。
 * 安卓的 RNGH `extractGestureHandlers` 按**原始 child index 逆序**遍历、完全不看 zIndex，
 * 于是被 dialog 压住的 panel（`zIndex.panelSuppressed` < `zIndex.backdrop`，画在遮罩下面）
 * 反而会被先遍历到——它没吞掉触摸只因为非 active 的壳一律 `pointerEvents="none"`，
 * 整棵子树在 `traverseWithPointerEvents` 里直接判 false、遍历才继续下穿到 backdrop。
 * iOS 恰好相反：UIKit hitTest 走按 zIndex 重排后的 subview 顺序，靠的是 zIndex 那条。
 * 改动这里的渲染顺序或那两个 zIndex 之前，先想清楚这两条
 * 返回键 + backdrop 共用一套 dismiss policy（本层统一分派，shells 不再各管返回键）
 * toast 层独立订阅（ToastLayer）：toast 增删/自动消失不重渲染 panel 栈
 */
import { useAtomValue } from 'jotai';
import { useEffect } from 'react';
import { BackHandler, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { space, zIndex } from '@/design';

import { dialogAtom, panelsAtom, toastsAtom } from './kernel/store';
import { Backdrop } from './shells/Backdrop';
import { Dialog } from './shells/Dialog';
import { FullScreen } from './shells/FullScreen';
import { Panel } from './shells/Panel';
import { Toast } from './shells/Toast';

import type { RefObject } from 'react';
import type { View as RNView } from 'react-native';

/** toast 层：独立订阅 toastsAtom，把频繁的 toast 变更隔离在 panel/dialog 渲染路径之外 */
function ToastLayer() {
    const toasts = useAtomValue(toastsAtom);
    const insets = useSafeAreaInsets();
    return (
        <View style={styles.toastRoot} pointerEvents="box-none">
            <View
                style={[styles.toastLayer, { top: insets.top + space.md }]}
                pointerEvents="box-none"
            >
                {toasts.map(toast => (
                    <Toast key={toast.id} entry={toast} />
                ))}
            </View>
        </View>
    );
}

export function OverlayHost({
    blurTarget,
}: {
    blurTarget: RefObject<RNView | null>;
}) {
    const dialog = useAtomValue(dialogAtom);
    const panels = useAtomValue(panelsAtom);

    const topPanel = panels.length > 0 ? panels[panels.length - 1] : undefined;
    const topmost = dialog ?? topPanel;
    const dismissible = topmost?.options?.dismissible ?? true;
    // 返回键与 backdrop 共用一套 dismiss policy：可关时恒弹一层
    // （dialog 存在关 dialog、否则弹栈顶 panel），不可关时消费但不关
    // 返回键仅在有阻断层时注册（此刻晚于导航 → 处于处理栈顶，先于导航拦截）
    useEffect(() => {
        if (!topmost) {
            return;
        }
        const onBack = () => {
            if (dismissible) {
                (dialog ?? topPanel)?.close(undefined);
            }
            return true;
        };
        const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
        return () => sub.remove();
    }, [topmost, dismissible, dialog, topPanel]);
    // backdrop 点击 = 返回键同款：只关最顶可关层（整栈清空归发起方显式关流程根 handle 级联、或 closeBlockingOverlays）
    const dismissBackdrop = () => {
        (dialog ?? topPanel)?.close(undefined);
    };
    // backdrop 常驻、透明度淡入淡出；可见 = 存在「未退场」的 dialog 或 panel
    // dialog 单独占屏退场时（无下层 panel）backdrop 与它协同淡出（用 !exiting 而非 !==null，不等卸载后才淡）
    const backdropVisible =
        (dialog !== null && !dialog.exiting) || panels.some(p => !p.exiting);
    // 视觉/交互在顶的是最顶「未退场」panel：退场中的旧顶让位给它，
    // 底下被揭开那层直接以不透明态露出（z 序遮住/露出），A→B 返回中间不留空档
    const topLive = panels.reduce((top, p, i) => (p.exiting ? top : i), -1);
    const lastIdx = panels.length - 1;
    return (
        <>
            <Backdrop
                visible={backdropVisible}
                onDismiss={dismissible ? dismissBackdrop : undefined}
                effect={topmost?.options?.backdropEffect}
                blurTarget={blurTarget}
            />
            {panels.map((panel, i) => {
                const shellProps = {
                    instance: panel,
                    visible: i === topLive,
                    active: i === lastIdx && !dialog && !panel.exiting,
                    raised: (i === topLive || !!panel.exiting) && !dialog,
                };
                return panel.kind === 'fullscreen' ? (
                    <FullScreen key={panel.id} {...shellProps} />
                ) : (
                    <Panel
                        key={panel.id}
                        {...shellProps}
                        covered={i < topLive}
                    />
                );
            })}
            {dialog ? <Dialog key={dialog.id} instance={dialog} /> : null}
            <ToastLayer />
        </>
    );
}

const styles = StyleSheet.create({
    toastRoot: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: zIndex.toast,
    },
    toastLayer: {
        position: 'absolute',
        left: 0,
        right: 0,
        paddingHorizontal: space.lg,
    },
});
