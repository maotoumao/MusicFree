/**
 * 可拖拽重排列表：FlashList v2 + Reanimated 4 + RNGH v3
 *
 * 手势/滚动共存（不锁死的关键，第一性原理）：
 * - 一个稳定的列表级 pan，`hitSlop` 限制在尾部把手条 → body 触摸根本不提取它，原生滚动即时正常
 * - `renderScrollComponent` 用 RNGH v3 `ScrollView` 并 `requireToFail={pan}` → 把手条内滚动确定性
 *   等待 pan、条外即时滚动；全程不切 `scrollEnabled`
 * - pan 引用全程稳定（消费方 callback 走 latest-ref），故 `renderScrollComponent` 不重挂原生滚动节点
 * 悬浮副本跟手在 UI 线程（floatingY）；被拖行由 JS `active` 状态同一次提交里原子隐藏
 * 自动滚动：JS 帧循环（rAF）+ FlashList `scrollToOffset`，速度按像素/秒用帧间 dt 积分
 * - 必须走 `scrollToOffset`（经原生 onScroll 驱动 FlashList 虚拟化）；reanimated UI 线程 `scrollTo`
 *   不触发 JS onScroll，会让虚拟化窗口滞后而在高速滚动时露白
 *
 * v1 不做「让位」（其余行不平移），后续再加
 * 契约：拖拽会话期间 data 顺序稳定；行严格等高、竖直无 header/顶部 padding、首行自 0 起
 */
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type ReactElement,
} from 'react';
import {
    I18nManager,
    StyleSheet,
    View,
    type LayoutChangeEvent,
    type ScrollViewProps,
    type StyleProp,
    type ViewStyle,
} from 'react-native';
import {
    GestureDetector,
    ScrollView,
    usePanGesture,
} from 'react-native-gesture-handler';
import Animated, {
    useAnimatedScrollHandler,
    useAnimatedStyle,
    useSharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { Icon } from '@/components/ui/Icon';
import { elevation, radius, useColors } from '@/design';

/** 尾部把手命中区宽度（= 把手视觉宽度），pan 仅在此条带内可激活 */
const HANDLE_ZONE = 56;
/** 触发自动滚动的边缘带占视口比例（至少一行高） */
const EDGE_RATIO = 0.18;
/** 自动滚动速度（像素/秒）：近边界慢、精细；满速约 351 行 2 秒到底 */
const AUTOSCROLL_MIN_SPEED = 600;
const AUTOSCROLL_MAX_SPEED = 12000;
/** 持续贴边到满速的时长（ms） */
const AUTOSCROLL_RAMP_MS = 250;
/** 掉帧时钳制单帧 dt，避免一帧跳太远 */
const AUTOSCROLL_MAX_DT = 50;
/** 预渲染距离：留出多帧最坏跳跃（满速 12000×50ms=600px）的缓冲，防高速滚动露白 */
const DRAW_DISTANCE = 1500;
/** 重排列表整体重排，关闭 FlashList 可见位置保持，避免落定后跳位 */
const MVCP_DISABLED = { disabled: true } as const;

// FlashList 包成 reanimated 组件：onScroll 走 UI 线程更新 scrollY 供 worklet 读取
const AnimatedFlashList = Animated.createAnimatedComponent(
    FlashList,
) as unknown as typeof FlashList;

export interface ReorderableListRenderInfo<T> {
    item: T;
    index: number;
    /** 该行正被拖拽（悬浮副本渲染时为 true）；调用方据此加高亮 */
    isDragging: boolean;
}

export interface ReorderableListProps<T> {
    data: readonly T[];
    keyExtractor: (item: T, index: number) => string;
    /** 行内容（不含把手，把手由本组件统一追加在尾部） */
    renderItem: (info: ReorderableListRenderInfo<T>) => ReactElement | null;
    /** 固定行高：等高约束是确定性拖拽的前提 */
    itemHeight: number;
    /** 落下且位置变化时触发；调用方用 reorderItems(data,from,to) 落地并持久化 */
    onReorder: (event: { from: number; to: number }) => void;
    /** 拿起时回调（做触觉反馈等，触觉由消费方接 infra） */
    onDragStart?: (index: number) => void;
    /** 松手时回调 */
    onDragEnd?: () => void;
    /** 关闭拖拽（不渲染把手、退化为普通列表） */
    dragEnabled?: boolean;
    ListEmptyComponent?: ReactElement | null;
    style?: StyleProp<ViewStyle>;
}

/** 行内容 + 尾部把手（把手为纯视觉指示，起手判定由 pan 的 hitSlop 命中条完成） */
function RowInner<T>({
    item,
    index,
    isDragging,
    itemHeight,
    renderContent,
    showHandle,
}: {
    item: T;
    index: number;
    isDragging: boolean;
    itemHeight: number;
    renderContent: (info: ReorderableListRenderInfo<T>) => ReactElement | null;
    showHandle: boolean;
}) {
    return (
        <View style={[styles.rowInner, { height: itemHeight }]}>
            <View style={styles.rowContent}>
                {renderContent({ item, index, isDragging })}
            </View>
            {showHandle ? (
                <View style={styles.handle}>
                    <Icon name="grip-vertical" color="textSecondary" />
                </View>
            ) : null}
        </View>
    );
}

/**
 * 列表内的一行：被拖行隐藏由 JS `active` 状态驱动（与悬浮副本同一次 React 提交切换、原子无缝隙）
 * 回收后按新 item 重新计算 isHidden，天然回收安全
 */
function ReorderableRow<T>({
    item,
    index,
    isHidden,
    itemHeight,
    renderContent,
    showHandle,
}: {
    item: T;
    index: number;
    isHidden: boolean;
    itemHeight: number;
    renderContent: (info: ReorderableListRenderInfo<T>) => ReactElement | null;
    showHandle: boolean;
}) {
    return (
        <View style={isHidden ? styles.hiddenRow : undefined}>
            <RowInner
                item={item}
                index={index}
                isDragging={false}
                itemHeight={itemHeight}
                renderContent={renderContent}
                showHandle={showHandle}
            />
        </View>
    );
}

export function ReorderableList<T>({
    data,
    keyExtractor,
    renderItem,
    itemHeight,
    onReorder,
    onDragStart,
    onDragEnd,
    dragEnabled = true,
    ListEmptyComponent,
    style,
}: ReorderableListProps<T>) {
    const colors = useColors();
    // FlashList 命令句柄：自动滚动经 scrollToOffset 驱动（保持虚拟化同步）
    const listRef = useRef<FlashListRef<T>>(null);

    const scrollY = useSharedValue(0);
    /** 悬浮副本相对视口顶的 y；base=拿起瞬间的行视口位置，跟手时叠加 translationY */
    const floatingY = useSharedValue(0);
    const floatingBase = useSharedValue(0);
    const viewportH = useSharedValue(0);
    const itemCount = useSharedValue(data.length);
    /** 行高共享值：worklet 读取，避免 pan 配置依赖 itemHeight prop 而重建 */
    const itemHeightSV = useSharedValue(itemHeight);
    /** onBegin 记下的把手所在行；onActivate 提升为真正拖拽 */
    const pendingIndex = useSharedValue(-1);
    const dragging = useSharedValue(false);

    // 悬浮副本渲染 + 被拖行隐藏判定用的 JS 快照
    const [active, setActive] = useState<{
        item: T;
        index: number;
        key: string;
    } | null>(null);

    // 拖拽跨帧只读的最新值，装进 ref → arm/disarm/commitDrop 引用稳定 → pan 与滚动组件不重建
    const dataRef = useRef(data);
    dataRef.current = data;
    const callbacksRef = useRef({
        keyExtractor,
        onReorder,
        onDragStart,
        onDragEnd,
    });
    callbacksRef.current = { keyExtractor, onReorder, onDragStart, onDragEnd };
    /** 拿起行的稳定 key：落点时按 key 反查 from，避免会话中 data 变化引用到错行 */
    const grabbedKeyRef = useRef('');
    /** 已成功 arm，用于 onDragStart/onDragEnd 严格配对 */
    const armedRef = useRef(false);
    const mountedRef = useRef(true);
    // 自动滚动帧循环状态（全在 JS 线程）
    const autoscrollRafRef = useRef<number | null>(null);
    /** 自动滚动积分出的目标偏移（= 实际滚动位置，scrollToOffset 逐帧应用） */
    const commandedOffsetRef = useRef(0);
    /** 已持续贴边时长（ms），驱动按住加速 */
    const holdMsRef = useRef(0);
    const lastFrameRef = useRef(0);

    useEffect(() => {
        itemCount.value = data.length;
    }, [data.length, itemCount]);
    useEffect(() => {
        itemHeightSV.value = itemHeight;
    }, [itemHeight, itemHeightSV]);

    const onScroll = useAnimatedScrollHandler(event => {
        scrollY.value = event.contentOffset.y;
    });

    // 自动滚动帧循环：JS 线程逐帧，速度按像素/秒用 dt 积分；贴边深度 + 按住时长（ms）取大者调速
    const autoscrollTick = useCallback(
        (timestamp: number) => {
            const dt =
                lastFrameRef.current === 0
                    ? 16
                    : Math.min(
                          timestamp - lastFrameRef.current,
                          AUTOSCROLL_MAX_DT,
                      );
            lastFrameRef.current = timestamp;

            const vh = viewportH.value;
            const h = itemHeightSV.value;
            const fy = floatingY.value;
            const edge = Math.max(h, vh * EDGE_RATIO);
            let dir = 0;
            let depth = 0;
            if (fy < edge) {
                dir = -1;
                depth = (edge - fy) / edge;
            } else if (fy > vh - h - edge) {
                dir = 1;
                depth = (fy - (vh - h - edge)) / edge;
            }
            if (dir === 0) {
                holdMsRef.current = 0;
            } else if (vh > 0) {
                holdMsRef.current += dt;
                depth = Math.min(1, Math.max(0, depth));
                const ramp = Math.max(
                    depth,
                    Math.min(1, holdMsRef.current / AUTOSCROLL_RAMP_MS),
                );
                const speed =
                    AUTOSCROLL_MIN_SPEED +
                    (AUTOSCROLL_MAX_SPEED - AUTOSCROLL_MIN_SPEED) * ramp;
                const maxScroll = Math.max(0, dataRef.current.length * h - vh);
                const next = Math.min(
                    Math.max(
                        commandedOffsetRef.current + dir * speed * (dt / 1000),
                        0,
                    ),
                    maxScroll,
                );
                if (next !== commandedOffsetRef.current) {
                    commandedOffsetRef.current = next;
                    listRef.current?.scrollToOffset({
                        offset: next,
                        animated: false,
                    });
                }
            }
            autoscrollRafRef.current = requestAnimationFrame(autoscrollTick);
        },
        [floatingY, itemHeightSV, viewportH],
    );
    const stopAutoscroll = useCallback(() => {
        if (autoscrollRafRef.current !== null) {
            cancelAnimationFrame(autoscrollRafRef.current);
            autoscrollRafRef.current = null;
        }
    }, []);

    useEffect(
        () => () => {
            mountedRef.current = false;
            stopAutoscroll();
        },
        [stopAutoscroll],
    );

    const arm = useCallback(
        (index: number) => {
            if (!mountedRef.current) {
                return;
            }
            const { keyExtractor: keyOf, onDragStart: onStart } =
                callbacksRef.current;
            const item = dataRef.current[index];
            if (item === undefined) {
                return;
            }
            armedRef.current = true;
            grabbedKeyRef.current = keyOf(item, index);
            commandedOffsetRef.current = scrollY.value;
            holdMsRef.current = 0;
            lastFrameRef.current = 0;
            setActive({ item, index, key: grabbedKeyRef.current });
            stopAutoscroll();
            autoscrollRafRef.current = requestAnimationFrame(autoscrollTick);
            onStart?.(index);
        },
        [autoscrollTick, scrollY, stopAutoscroll],
    );
    const disarm = useCallback(() => {
        stopAutoscroll();
        setActive(null);
        if (armedRef.current) {
            armedRef.current = false;
            callbacksRef.current.onDragEnd?.();
        }
    }, [stopAutoscroll]);
    const commitDrop = useCallback(() => {
        if (!mountedRef.current) {
            return;
        }
        const { keyExtractor: keyOf, onReorder: reorder } =
            callbacksRef.current;
        const h = itemHeightSV.value;
        // 落点用 commandedOffset（拖拽期间权威滚动位置），非滞后的 onScroll
        const center = floatingY.value + commandedOffsetRef.current + h / 2;
        const to = Math.min(
            Math.max(Math.floor(center / h), 0),
            dataRef.current.length - 1,
        );
        const key = grabbedKeyRef.current;
        const from = dataRef.current.findIndex(
            (item, index) => keyOf(item, index) === key,
        );
        if (from >= 0 && to >= 0 && from !== to) {
            reorder({ from, to });
        }
    }, [floatingY, itemHeightSV]);

    // 列表级 pan：hitSlop 限定尾部把手条（RTL 下改物理左侧）→ 条外交原生滚动、条内与滚动经 requireToFail 仲裁
    const pan = usePanGesture(
        useMemo<NonNullable<Parameters<typeof usePanGesture>[0]>>(
            () => ({
                enabled: dragEnabled,
                maxPointers: 1,
                hitSlop: I18nManager.isRTL
                    ? { left: 0, width: HANDLE_ZONE }
                    : { right: 0, width: HANDLE_ZONE },
                onBegin: event => {
                    'worklet';
                    const raw = Math.floor(
                        (event.y + scrollY.value) / itemHeightSV.value,
                    );
                    // 空白/越界（如短列表末行下方）拒绝起手
                    pendingIndex.value =
                        raw >= 0 && raw < itemCount.value ? raw : -1;
                },
                onActivate: () => {
                    'worklet';
                    const idx = pendingIndex.value;
                    if (idx < 0) {
                        return;
                    }
                    const h = itemHeightSV.value;
                    const maxY = Math.max(0, viewportH.value - h);
                    const base = idx * h - scrollY.value;
                    floatingBase.value = base;
                    floatingY.value = Math.min(Math.max(base, 0), maxY);
                    dragging.value = true;
                    scheduleOnRN(arm, idx);
                },
                onUpdate: event => {
                    'worklet';
                    if (!dragging.value) {
                        return;
                    }
                    const maxY = Math.max(
                        0,
                        viewportH.value - itemHeightSV.value,
                    );
                    floatingY.value = Math.min(
                        Math.max(floatingBase.value + event.translationY, 0),
                        maxY,
                    );
                },
                onDeactivate: event => {
                    'worklet';
                    if (!dragging.value || event.canceled) {
                        return;
                    }
                    scheduleOnRN(commitDrop);
                },
                onFinalize: () => {
                    'worklet';
                    if (dragging.value) {
                        dragging.value = false;
                        scheduleOnRN(disarm);
                    }
                    pendingIndex.value = -1;
                },
            }),
            [
                dragEnabled,
                arm,
                commitDrop,
                disarm,
                scrollY,
                itemCount,
                itemHeightSV,
                pendingIndex,
                viewportH,
                floatingBase,
                floatingY,
                dragging,
            ],
        ),
    );

    // 原生滚动组件用 RNGH ScrollView，并 requireToFail 该 pan：把手条内滚动等 pan 失败才滚
    const renderScroll = useCallback(
        (props: ScrollViewProps) => (
            <ScrollView {...props} requireToFail={pan} />
        ),
        [pan],
    );

    const renderRow = useCallback(
        ({ item, index }: { item: T; index: number }) => {
            const itemKey = keyExtractor(item, index);
            return (
                <ReorderableRow
                    item={item}
                    index={index}
                    isHidden={active !== null && active.key === itemKey}
                    itemHeight={itemHeight}
                    renderContent={renderItem}
                    showHandle={dragEnabled}
                />
            );
        },
        [active, keyExtractor, itemHeight, renderItem, dragEnabled],
    );

    const floatingStyle = useAnimatedStyle(() => ({
        transform: [{ translateY: floatingY.value }],
    }));

    return (
        <View
            style={[styles.container, style]}
            onLayout={(event: LayoutChangeEvent) => {
                viewportH.value = event.nativeEvent.layout.height;
            }}
        >
            <GestureDetector gesture={pan}>
                <AnimatedFlashList
                    ref={listRef}
                    data={data}
                    extraData={active}
                    renderItem={renderRow}
                    keyExtractor={keyExtractor}
                    onScroll={onScroll}
                    scrollEventThrottle={16}
                    renderScrollComponent={renderScroll}
                    maintainVisibleContentPosition={MVCP_DISABLED}
                    drawDistance={DRAW_DISTANCE}
                    ListEmptyComponent={ListEmptyComponent}
                />
            </GestureDetector>
            {active !== null ? (
                <Animated.View
                    pointerEvents="none"
                    accessibilityElementsHidden
                    importantForAccessibility="no-hide-descendants"
                    style={[
                        styles.floating,
                        {
                            height: itemHeight,
                            backgroundColor: colors.surface,
                            shadowColor: colors.shadow,
                        },
                        floatingStyle,
                    ]}
                >
                    <RowInner
                        item={active.item}
                        index={active.index}
                        isDragging
                        itemHeight={itemHeight}
                        renderContent={renderItem}
                        showHandle={dragEnabled}
                    />
                </Animated.View>
            ) : null}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        overflow: 'hidden',
    },
    rowInner: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    rowContent: {
        flex: 1,
    },
    hiddenRow: {
        opacity: 0,
    },
    handle: {
        width: HANDLE_ZONE,
        alignSelf: 'stretch',
        alignItems: 'center',
        justifyContent: 'center',
    },
    floating: {
        position: 'absolute',
        left: 0,
        right: 0,
        top: 0,
        borderRadius: radius.md,
        ...elevation.lg,
    },
});
