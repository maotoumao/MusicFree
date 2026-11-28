/**
 * Panel 壳：竖屏底部 sheet / 横屏右侧全高（纯壳，不懂业务；内容由注册组件渲染）
 * 进出走命令式 useAnimatedStyle（transition 共享值驱滑动 + 淡入）+ presence：close 只标 instance.exiting、
 * 壳播完退场再 removePanel 真卸载——绕开 reanimated 声明式 entering/exiting 在 New Arch/Fabric 的整屏白闪
 * visible=内容在屏（最顶未退场 panel）：仅下发给内容做暂停判断
 * active=真正可交互那一个（物理栈顶 + 无 dialog + 未退场）：触摸/读屏跟它
 * raised=压在共享遮罩之上（最顶未退场 或 退场中，且无 dialog）：zIndex 跟它（dialog 压顶时落遮罩下被压暗）
 * covered=被更高 panel 盖住（i<topLive）：opacity 淡隐到 0——不等高 sheet 无法靠 z 序互遮故自淡；揭开时随上层退场同步淡回、不留空档
 * 键盘避让（竖屏）：'avoid'（默认）外层壳整体 translateY 上移 + 内层 sheet 收高；'overlap' 完全不避让（面板静止、键盘覆盖下部）；返回键由 OverlayHost 统一接管
 * memo + 稳定 status：toast/无关重渲染不波及已挂载 panel
 * TODO handle 拖拽关闭（在 transition 之外再叠一层 translateY）
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Keyboard, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useKeyboardHandler } from 'react-native-keyboard-controller';
import Animated, {
    useAnimatedReaction,
    useAnimatedStyle,
    useSharedValue,
    withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import {
    duration,
    easing,
    elevation,
    layout,
    radius,
    space,
    useColors,
    zIndex,
} from '@/design';
import { useLayoutClass } from '@/hooks/useLayoutClass';
import { useOrientation } from '@/hooks/useOrientation';

import { removePanel } from '../kernel/controller';
import { OverlayStatusProvider } from '../useOverlayStatus';

import { useOverlayTransition } from './useOverlayTransition';

import type { OverlayInstance, PanelOptions } from '../kernel/types';

/** 进场进度越过此阈值即揭示重内容（对齐旧版 ~0.8）：让列表在滑动尾部渲染、hitch 被运动掩盖 */
const ENTER_REVEAL_PROGRESS = 0.8;

export const Panel = memo(function PanelShell({
    instance,
    visible,
    active,
    raised,
    covered,
}: {
    instance: OverlayInstance;
    visible: boolean;
    active: boolean;
    raised: boolean;
    covered: boolean;
}) {
    const colors = useColors();
    const insets = useSafeAreaInsets();
    const { width: windowWidth, height: windowHeight } = useWindowDimensions();
    const orientation = useOrientation();
    const layoutClass = useLayoutClass();
    const Component = instance.Component;
    // 手机：朝向仍由 useOrientation 判（与适配前同一来源、同一帧行为）；
    // 平板：朝向与「竖屏限宽」都从同一个 layoutClass 快照派生——两个 hook 订阅 Dimensions 的机制不同
    // （useState+effect vs useSyncExternalStore），旋转那一帧若各取一个会拼出「旧朝向 + 新类别」的中间布局
    const landscape =
        layoutClass === 'phone'
            ? orientation === 'landscape'
            : layoutClass === 'tabletLandscape';
    // 平板竖屏：底部 sheet 限宽居中（原则五：一张 800dp 宽的动作列表，每一行只用到左边三分之一）
    // 手机恒 false → 静态样式原样；横屏走右侧全高侧栏，与此无关
    const narrowSheet = layoutClass === 'tabletPortrait';
    // active 已由 host 收窄为「物理栈顶 + 无 dialog + 未退场」= 真正可交互那一个，直接用
    // 进场进度过阈值即置 true：内容层据此把重活（如大列表）推迟到滑动尾部渲染，hitch 被运动掩盖、不压卡开场
    const [entered, setEntered] = useState(false);
    // 内容层稳定读到 active/visible/entered：只在真值变化时换引用，避免无谓重渲染
    const status = useMemo(
        () => ({ active, visible, entered }),
        [active, visible, entered],
    );
    // 进出 presence：close 只把 instance.exiting 置真，这里驱 transition 退场后 removePanel 真卸载
    const onExited = useCallback(() => removePanel(instance.id), [instance.id]);
    // 量到 sheet 尺寸后才起进场：避免先用窗口 fallback 起步、量到真值再中途跳滑动距离
    const [measured, setMeasured] = useState(false);
    const present = measured && !instance.exiting;
    const transition = useOverlayTransition({ present, onExited });
    // 进场进度越过阈值即揭示重内容（对齐旧版）：react 每帧被调，用 !previous 只在首次越阈时发一次
    // reduced-motion 下 progress 直接跳 1、首帧 previous=null 也会触发
    useAnimatedReaction(
        () => transition.value > ENTER_REVEAL_PROGRESS,
        (revealed, previous) => {
            if (revealed && !previous) {
                scheduleOnRN(setEntered, true);
            }
        },
        [],
    );
    // 从未现身（量到尺寸 + 未退场）就被关（挂载即 exiting / open→close 同帧 / 父级首帧前级联关）
    // → 直接卸载：没有退场画面可播，且 useOverlayTransition 的 entered 守卫会让这种实例 onExited 永不触发而僵死占位
    const shownRef = useRef(false);
    if (present) {
        shownRef.current = true;
    }
    useEffect(() => {
        if (instance.exiting && !shownRef.current) {
            removePanel(instance.id);
        }
    }, [instance.exiting, instance.id]);
    // 覆盖淡隐：被更高 panel 盖住时 opacity→0（不等高 sheet 无法靠 z 序互遮，须自淡）；
    // covered 按 topLive 判定——上层一开始退场就淡回，与其退场同步、不留空档
    const coverFade = useSharedValue(covered ? 0 : 1);
    useEffect(() => {
        coverFade.value = withTiming(covered ? 0 : 1, {
            duration: duration.base,
            easing: easing.standard,
        });
    }, [covered, coverFade]);
    // 退场即收键盘：含输入的面板（如文本提交）关闭后键盘不该滞留——presence 延迟卸载期间
    // 输入框仍挂载且聚焦，靠卸载自动收不可靠；无键盘时 dismiss 为 no-op
    useEffect(() => {
        if (instance.exiting) {
            Keyboard.dismiss();
        }
    }, [instance.exiting]);
    // 滑入距离取 sheet 自身尺寸（onLayout 量得、共享值免重渲）：竖屏按高、横屏按宽整体滑出屏外
    const sheetH = useSharedValue(0);
    const sheetW = useSharedValue(0);
    // 键盘高度（开时取负、直接当 translateY 上移）：useKeyboardHandler 直取 worklet 回调，
    // 比 useReanimatedKeyboardAnimation 的双值同步层更稳（后者偶发不更新、致 sheet 被键盘挡）
    const keyboardHeight = useSharedValue(0);
    useKeyboardHandler(
        {
            onMove: e => {
                'worklet';
                keyboardHeight.value = -e.height;
            },
            onEnd: e => {
                'worklet';
                keyboardHeight.value = -e.height;
            },
        },
        [],
    );
    // 键盘避让行为：'avoid'（默认）跟随键盘位移 + 长面板收高；'overlap' 完全不避让（面板静止、键盘覆盖其下部，顶部输入 + 下方可滚内容用）
    const keyboardBehavior =
        (instance.options as PanelOptions | undefined)?.keyboardBehavior ??
        'avoid';
    // 仅「avoid 行为且持有键盘」的面板避让：active（输入在它上面）或 exiting（刚关、随键盘一起收下去）；
    // avoidsKeyboard 同时管 translateY 与 maxHeight 收缩两处——overlap 恒 false → 位置 / 高度全不变；
    // 被揭开的下层面板不持有键盘，别被正在消失的键盘裹挟着从上往下移
    const avoidsKeyboard =
        keyboardBehavior === 'avoid' &&
        !landscape &&
        (active || !!instance.exiting);
    // 键盘位移单独放外层壳：与内层进出滑动分属两节点，各自独立 translateY，互不干扰
    const keyboardShiftStyle = useAnimatedStyle(
        () => ({
            transform: [
                { translateY: avoidsKeyboard ? keyboardHeight.value : 0 },
            ],
        }),
        [avoidsKeyboard],
    );
    // 内层 sheet：进出滑动 + 进出淡入淡出（transition）；持有键盘时收高避让
    // 覆盖/被 dialog 压顶的压暗走 z 序（panelSuppressed 落到共享遮罩之下），不自淡——免得盖住时淡没、露出留空档
    const sheetStyle = useAnimatedStyle(() => {
        const enter = transition.value;
        const keyboardOffset = avoidsKeyboard ? keyboardHeight.value : 0;
        const availableHeight = Math.max(
            0,
            windowHeight - insets.top + keyboardOffset,
        );
        // 进场 enter 0→1：从屏外（sheet 自身尺寸处）滑到 0；退场反之
        const offscreen = landscape
            ? sheetW.value || windowWidth
            : sheetH.value || windowHeight;
        return {
            opacity: enter * coverFade.value,
            // 长 sheet 收缩到「顶部安全区↔键盘上沿」，防标题被顶出屏幕
            maxHeight: landscape
                ? undefined
                : Math.min(windowHeight * 0.8, availableHeight),
            transform: [
                landscape
                    ? { translateX: (1 - enter) * offscreen }
                    : { translateY: (1 - enter) * offscreen },
            ],
        };
    }, [insets.top, landscape, windowHeight, windowWidth, avoidsKeyboard]);
    // 动态样式（主题色/安全区）抽成变量：必要的运行时值，非 inline 字面量
    // 水平内距交给内容（滚动条贴边），壳只补自己**真的挨着**的那条屏幕边的安全区；
    // 底部保留安全区 + space.xl 呼吸区
    const sheetDynamic = {
        backgroundColor: colors.overlaySurface,
        shadowColor: colors.shadow,
        /*
         * 横屏是贴右边缘的全高侧栏，顶边与屏幕顶边重合——和它底下那页的 AppBar 同一条顶边。
         * AppBar 是「insets.top + 内容行」、不额外留呼吸区，故内容中线落在行高的一半处：
         * 平板横屏 56 → insets.top + 28，手机横屏（矮窗档）48 → insets.top + 24
         * （见 layout/appBarLayout.appBarHeightFor）。
         * 面板若也补 lg，头部行会比底下那页低一档，同一屏上两条标题线错开。补 sm 收回来。
         *
         * 这个「齐平」是按**头部是一行 sm 档按钮**的面板算的（如 PlayQueuePanel：xl 标题 +
         * 两个 sm ghost Button，行高 36 → 中线 insets.top + 8 + 18 = insets.top + 26）。
         * 相对 AppBar 中线差 2dp（y 向下增长，26 比 28 小即面板中线更靠上）：
         * 平板横屏面板高 2dp、手机横屏面板低 2dp，量级一样、方向相反，都在视觉齐平范围内。
         * 这里刻意**不**跟着矮窗档走——上面那个 landscape 是复合判据
         * （手机看 useOrientation，平板看 layoutClass === 'tabletLandscape'），
         * 平板横屏恒不是矮窗，为 2dp 再引一个第二判据不划算。
         * 头部不是按钮行的面板（ActionSheetPanel 无 title 时第一件东西就是列表行）
         * 拿不到这个对齐，只是横屏顶部一并收紧了 8dp
         *
         * 竖屏底部 sheet 反过来：没有状态栏要让、自己还有个圆角上沿，留 lg 呼吸区
         */
        paddingTop: landscape ? insets.top + space.sm : space.lg,
        paddingBottom: insets.bottom + space.xl,
        /*
         * 左安全区按**面板左边缘与它的实际交叠**补，不恒补也不恒不补
         *
         * 侧栏是 `width: '100%'` + `maxWidth: panelSideWidth`，故它的左边缘距屏幕左边
         * `max(0, 窗口宽 − 420)`。常规横屏（窗口远宽于 420）这个距离足够大，`insets.left`
         * 记的是**对侧**挖孔的账，补进来就是一段无来由的左留白（横屏挖孔在左时能有 30dp）。
         * 但 useOrientation 判横屏只要「宽 ≥ 高」，不要求宽远大于高——`400 × 300` 这类
         * 多窗口/自由窗口里面板会铺满整个窗口宽，左边缘**就是**屏幕左边缘，那时必须补。
         * 两种情形由下面这个交叠式统一覆盖
         *
         * 前提：面板总是停在右边。`rootRight` 是 `row + flex-end`，Yoga 在 RTL 下会翻到左边。
         * 这个前提**不是靠「触发不到」成立的**：manifest 开了 `android:supportsRtl="true"`，
         * Android 按**设备 locale** 定 `Configuration.getLayoutDirection()`（RN 原生的 I18nUtil
         * 读 manifest 与系统偏好，不读我们那份三语的 JS 语言表），用户把手机设成阿拉伯语就会
         * 拿到 RTL、文案 fallback 到 en-US——路径是可达的。
         *
         * 它成立是因为**本 App 整体没做 RTL 适配**（全仓只有 ReorderableList 读 I18nManager）：
         * 真到 RTL locale，每一处 `flexDirection: 'row'` 与物理内距都会一起翻，不是本壳独有的问题。
         * 真要支持时，这里、`rootRight` 的 flex-end 与 `sheetRight` 的物理圆角要一并改
         */
        paddingLeft: landscape
            ? Math.max(
                  0,
                  insets.left -
                      Math.max(0, windowWidth - layout.panelSideWidth),
              )
            : 0,
        paddingRight: landscape ? insets.right : 0,
    };
    return (
        <View
            style={[
                styles.root,
                landscape ? styles.rootRight : styles.rootBottom,
                { zIndex: raised ? zIndex.panel : zIndex.panelSuppressed },
            ]}
            pointerEvents={active ? 'box-none' : 'none'}
        >
            <Animated.View
                collapsable={false}
                style={[
                    landscape
                        ? styles.shiftRight
                        : narrowSheet
                        ? styles.shiftBottomNarrow
                        : styles.shiftBottom,
                    keyboardShiftStyle,
                ]}
            >
                <Animated.View
                    collapsable={false}
                    onLayout={e => {
                        sheetH.value = e.nativeEvent.layout.height;
                        sheetW.value = e.nativeEvent.layout.width;
                        if (!measured) {
                            setMeasured(true);
                        }
                    }}
                    accessibilityElementsHidden={!active}
                    importantForAccessibility={
                        active ? 'auto' : 'no-hide-descendants'
                    }
                    style={[
                        landscape
                            ? styles.sheetRight
                            : narrowSheet
                            ? styles.sheetBottomNarrow
                            : styles.sheetBottom,
                        elevation.lg,
                        sheetDynamic,
                        sheetStyle,
                    ]}
                >
                    <OverlayStatusProvider value={status}>
                        <Component
                            payload={instance.payload}
                            close={instance.close}
                        />
                    </OverlayStatusProvider>
                </Animated.View>
            </Animated.View>
        </View>
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
    rootBottom: {
        justifyContent: 'flex-end',
    },
    rootRight: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
    },
    // 键盘位移外层：撑满对应轴，给内层 sheet 的百分比宽/高一个确定参照
    shiftBottom: {
        width: '100%',
    },
    /** 平板竖屏：外层壳同样限宽居中，内层 sheet 的 100% 才是 560 */
    shiftBottomNarrow: {
        width: '100%',
        maxWidth: layout.panelMaxWidth,
        alignSelf: 'center',
    },
    shiftRight: {
        height: '100%',
        width: '100%',
        maxWidth: layout.panelSideWidth,
    },
    sheetBottom: {
        width: '100%',
        maxHeight: '80%',
        borderTopLeftRadius: radius.xl,
        borderTopRightRadius: radius.xl,
    },
    sheetBottomNarrow: {
        width: '100%',
        maxWidth: layout.panelMaxWidth,
        alignSelf: 'center',
        maxHeight: '80%',
        borderTopLeftRadius: radius.xl,
        borderTopRightRadius: radius.xl,
    },
    sheetRight: {
        height: '100%',
        width: '100%',
        maxWidth: layout.panelSideWidth,
        borderTopLeftRadius: radius.xl,
        borderBottomLeftRadius: radius.xl,
    },
});
