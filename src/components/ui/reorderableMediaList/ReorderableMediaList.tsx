/**
 * ReorderableMediaList：Skia 自绘的虚拟化媒体列表（拖拽重排 + 让位 + 落定握手）
 *
 * 结构（spike 已验）：隐形真 ScrollView（itemCount×行高的空占位）供原生滚动物理 → onScroll → offsetY；
 * Skia 画布盖上（pointerEvents none），固定 slot 池按 offsetY 在 UI 线程回收重画，节点数恒定≈视口行数
 * 数据通路：JS 把 data 经 getItemContent 投影成轻量不可变快照数组（primitive）放进 shared value，
 * slot 的 paragraph 在 UI 线程按 snapshot[行号] 构建（reanimated 对相同派生值不通知下游 → 仅跨行/变化时重建）
 *
 * 拖拽：列表级单 Pan，hitSlop 只圈尾部把手条 → 条外交原生滚动、条内经 requireToFail 仲裁；
 * 抓起的行画到顶层浮层跟手（原位按 key 隐藏），拖动时其余行按「无状态目标位移」平滑让位腾出落点空档
 * 落定握手：松手把浮层吸附到目标槽、原位续隐藏，直到父数据真正落定（`landed` 派生：目标位 key 到位）
 * 才在同一派生链里原子归位 → 不回跳；reaction 仅回 JS 收尾（清 preview/定时器）
 * 全程 UI 线程驱动（浮层/隐藏/让位皆派生值）；onDragStart/onDragEnd 与手指起落配对、经 scheduleOnRN 回 JS
 * 边缘自动滚动：拖到上/下边缘时帧回调逐帧推进 offsetY；slot 回收换行时让位 shift 直接吸附（不残影）
 */
import { Canvas, Group } from '@shopify/react-native-skia';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import {
    GestureDetector,
    ScrollView as GHScrollView,
    useExclusiveGestures,
    usePanGesture,
    useTapGesture,
} from 'react-native-gesture-handler';
import Animated, {
    scrollTo,
    useAnimatedRef,
    useAnimatedReaction,
    useAnimatedScrollHandler,
    useDerivedValue,
    useFrameCallback,
    useSharedValue,
    withTiming,
    type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { duration, easing, fontSize, useColors } from '@/design';

import {
    buildRowParagraph,
    DRAG_HANDLE_WIDTH,
    measureTagWidth,
    rowContentBounds,
    SKIA_ROW_HEIGHT,
    SkiaListItem,
    TAG_GAP,
    TAG_MAX_FRACTION,
    TAG_PAD_H,
    TAG_TEXT_SIZE,
} from './SkiaListItem';
import { type ReorderableMediaListProps } from './types';

const TITLE_SIZE = fontSize.md; // 15
const SUBTITLE_SIZE = fontSize.sm; // 13
const OVERSCAN = 2;
/** 隐藏行的画布外 Y：Skia Group 的动画 opacity 在 2.10 本工程不生效，改用 transform 移出画布 */
const OFFSCREEN_Y = -100000;
/** 父级 onReorder 未回写数据时的兜底释放时限（ms），避免 preview 卡死 */
const SETTLE_TIMEOUT_MS = 600;
/** 触发自动滚动的边缘带宽度（行数），矮视口按下方比例封顶 */
const AUTOSCROLL_EDGE_ROWS = 3;
/** 边缘带最多占视口比例（矮视口时避免上下带重叠、留出中间静止区） */
const AUTOSCROLL_EDGE_MAX_FRACTION = 0.4;
/** 自动滚动满速（px/s，贴到屏幕边缘时）；起速为 0、按深度平方 ease-in 加速 */
const AUTOSCROLL_MAX_SPEED = 9000;
/** 掉帧/回前台时钳制单帧步长（ms），避免一帧跳太远撞边界 */
const AUTOSCROLL_MAX_DT = 50;
/** 多选整行 tap 允许的最大移动（px）；超出即失败让位滚动 */
const SELECT_TAP_MAX_DISTANCE = 10;
/** selectedKeys 缺省空集（避免每次渲染新建引用） */
const EMPTY_SELECTED_KEYS: ReadonlySet<string> = new Set();

// RNGH ScrollView 包成 reanimated 组件：onScroll 走 UI 线程更新 offsetY；requireToFail 供拖拽仲裁
const AnimatedScrollView = Animated.createAnimatedComponent(GHScrollView);

/** UI 线程用的轻量行快照（primitive；subtitle / sourceLabel 空串 = 无） */
interface RowSnapshot {
    key: string;
    title: string;
    subtitle: string;
    sourceLabel: string;
}

/** slot worklet 用的已解析色（主题变即换、派生重建） */
interface Palette {
    title: string;
    subtitle: string;
    handle: string;
    /** 浮起行背景（抬起感；普通行本身透明） */
    floatingBackground: string;
    /** 平台 Tag 文字色（textSecondary） */
    tagText: string;
    /** 平台 Tag pill 底色（surfaceVariant） */
    tagBackground: string;
    /** 选中行底色（primarySoft） */
    selectedBackground: string;
    /** checkbox 选中态填充 + 边框（primary） */
    checkboxChecked: string;
    /** checkbox 未选边框基色（border） */
    checkboxUncheckedBorder: string;
    /** checkbox 对勾（onPrimary） */
    checkboxCheckmark: string;
}

/** 拖拽会话的 UI 线程共享态（拖拽期 + 落定期都用；驱动浮层/隐藏/让位派生） */
interface DragState {
    /** 手指正在拖（pan 激活中） */
    dragging: SharedValue<boolean>;
    /** 已松手、浮层吸附到落点、等父数据落定 */
    settling: SharedValue<boolean>;
    /** 派生：settling 期且目标位 key 已是被拖行 → 数据落定，preview 视觉即刻归位 */
    landed: SharedValue<boolean>;
    /** 抓起行的原始行号（让位与浮层内容取此行） */
    fromIndex: SharedValue<number>;
    /** 当前落点行号（拖拽中随浮层派生、settling 期冻结为落点） */
    hoverIndex: SharedValue<number>;
    /** 抓起行的稳定 key（原位按 key 隐藏，落定按 key 判定到位） */
    grabbedKey: SharedValue<string>;
}

/**
 * 多选 UI 线程镜像：基线 base + 例外集 overrides（判定 overrides[key] ?? base）
 * 全选/反选只翻 base + 清 overrides = O(1)、不跨线程传万 key；例外集稀疏（仅存与基线不同者）
 */
interface SelectionState {
    /** 基线：true = 默认全选、false = 默认全不选 */
    base: SharedValue<boolean>;
    /** 相对基线翻转的例外集 */
    overrides: SharedValue<Record<string, boolean>>;
}

/**
 * 按行号在 UI 线程派生一行的 标题/副标题/序号 paragraph（slot 回收行与浮起行共用）
 * index 变化才重建（reanimated 对相同派生值不通知下游）
 */
function useRowParagraphs(
    snapshot: SharedValue<RowSnapshot[]>,
    index: SharedValue<number>,
    palette: Palette,
    showPosition: boolean,
) {
    const titleParagraph = useDerivedValue(() => {
        const row = snapshot.value[index.value];
        return row
            ? buildRowParagraph(row.title, palette.title, TITLE_SIZE)
            : null;
    });
    const subtitleParagraph = useDerivedValue(() => {
        const row = snapshot.value[index.value];
        return row && row.subtitle
            ? buildRowParagraph(row.subtitle, palette.subtitle, SUBTITLE_SIZE)
            : null;
    });
    const positionParagraph = useDerivedValue(() => {
        if (!showPosition) {
            return null;
        }
        const row = snapshot.value[index.value];
        return row
            ? buildRowParagraph(
                  String(index.value + 1),
                  palette.subtitle,
                  TITLE_SIZE,
                  true,
              )
            : null;
    });
    return { titleParagraph, subtitleParagraph, positionParagraph };
}

/**
 * 按行号在 UI 线程算平台 Tag 布局（slot 行与浮起行共用）：
 * 建 label paragraph → 测 pill 宽 → 右对齐平移 + 标题让宽；contentX/contentRight 为静态几何
 */
function useTagLayout(
    snapshot: SharedValue<RowSnapshot[]>,
    index: SharedValue<number>,
    palette: Palette,
    contentX: number,
    contentRight: number,
) {
    const sourceLabelParagraph = useDerivedValue(() => {
        const row = snapshot.value[index.value];
        return row && row.sourceLabel
            ? buildRowParagraph(row.sourceLabel, palette.tagText, TAG_TEXT_SIZE)
            : null;
    });
    const tagWidth = useDerivedValue(() => {
        const p = sourceLabelParagraph.value;
        if (!p) {
            return 0;
        }
        // 封顶内容区 33%（对齐 MusicRow）：超长来源名截断、不挤爆标题
        const maxTag = (contentRight - contentX) * TAG_MAX_FRACTION;
        return Math.min(measureTagWidth(p), maxTag);
    });
    const tagLabelWidth = useDerivedValue(() =>
        Math.max(0, tagWidth.value - 2 * TAG_PAD_H),
    );
    const tagTransform = useDerivedValue(() => [
        { translateX: contentRight - tagWidth.value },
    ]);
    const titleWidth = useDerivedValue(() => {
        const full = contentRight - contentX;
        const tw = tagWidth.value;
        return tw > 0 ? Math.max(0, full - tw - TAG_GAP) : full;
    });
    return {
        sourceLabelParagraph,
        tagWidth,
        tagLabelWidth,
        tagTransform,
        titleWidth,
    };
}

/**
 * 按行号在 UI 线程派生该行的选中态与 checkbox / 选中背景色（slot 行与浮起行共用）
 * 选中 = overrides[key] ?? base；非 selectable 时 base 恒 false → 恒未选、色恒透明
 */
function useRowSelection(
    snapshot: SharedValue<RowSnapshot[]>,
    index: SharedValue<number>,
    selection: SelectionState,
    palette: Palette,
) {
    const selected = useDerivedValue(() => {
        const row = snapshot.value[index.value];
        if (!row) {
            return false;
        }
        // 只认 own 布尔值：避开 __proto__/toString 等原型键被误读为已选
        const flag = selection.overrides.value[row.key];
        return typeof flag === 'boolean' ? flag : selection.base.value;
    });
    const checkboxFill = useDerivedValue(() =>
        selected.value ? palette.checkboxChecked : 'transparent',
    );
    const checkboxBorder = useDerivedValue(() =>
        selected.value
            ? palette.checkboxChecked
            : palette.checkboxUncheckedBorder,
    );
    const checkboxCheck = useDerivedValue(() =>
        selected.value ? palette.checkboxCheckmark : 'transparent',
    );
    const selectedBackground = useDerivedValue(() =>
        selected.value ? palette.selectedBackground : 'transparent',
    );
    return {
        selected,
        checkboxFill,
        checkboxBorder,
        checkboxCheck,
        selectedBackground,
    };
}

function RowSlot({
    slot,
    offsetY,
    snapshot,
    drag,
    width,
    showPosition,
    showHandle,
    selectable,
    selection,
    palette,
}: {
    slot: number;
    offsetY: SharedValue<number>;
    snapshot: SharedValue<RowSnapshot[]>;
    drag: DragState;
    width: number;
    showPosition: boolean;
    showHandle: boolean;
    selectable: boolean;
    selection: SelectionState;
    palette: Palette;
}) {
    // 本 slot 当前承载的行号（first+slot；随滚动整池同步推进）
    const rowIndex = useDerivedValue(
        () => Math.floor(offsetY.value / SKIA_ROW_HEIGHT) + slot,
    );
    const { titleParagraph, subtitleParagraph, positionParagraph } =
        useRowParagraphs(snapshot, rowIndex, palette, showPosition);
    const { contentX, contentRight } = rowContentBounds(
        width,
        showPosition,
        showHandle,
        selectable,
    );
    const tag = useTagLayout(
        snapshot,
        rowIndex,
        palette,
        contentX,
        contentRight,
    );
    const sel = useRowSelection(snapshot, rowIndex, selection, palette);

    // 让位目标位移（无状态）：抓起 a→落点 t 之间的行整体让开一行高度；数据落定后即刻回 0
    const targetShift = useDerivedValue(() => {
        if (
            !(drag.dragging.value || drag.settling.value) ||
            drag.landed.value
        ) {
            return 0;
        }
        const a = drag.fromIndex.value;
        const t = drag.hoverIndex.value;
        const i = rowIndex.value;
        if (a < 0 || t < 0) {
            return 0;
        }
        if (a < t) {
            return i > a && i <= t ? -SKIA_ROW_HEIGHT : 0;
        }
        if (t < a) {
            return i >= t && i < a ? SKIA_ROW_HEIGHT : 0;
        }
        return 0;
    });
    // 拖拽中向目标位移平滑缓动；非 dragging（落定/释放，target 回 0）时直接吸附
    // （此刻数据已成最终序，让位视觉与最终序恰好重合，snap 即无缝、动画反而多余抖动）
    const shift = useSharedValue(0);
    useAnimatedReaction(
        () => ({
            target: targetShift.value,
            dragging: drag.dragging.value,
            row: rowIndex.value,
        }),
        (curr, prev) => {
            // 首次，或自动滚动使 slot 回收换绑到新逻辑行 → 直接吸附（不从旧行的位移动画起步）
            if (prev === null || curr.row !== prev.row) {
                shift.value = curr.target;
                return;
            }
            if (curr.target === prev.target) {
                return;
            }
            shift.value = curr.dragging
                ? withTiming(curr.target, {
                      duration: duration.fast,
                      easing: easing.standard,
                  })
                : curr.target;
        },
    );

    // 隐藏（抓起行原位 + 越界/未投影 slot）走 transform 移出画布，而非 Group opacity
    // （Skia Group 的动画 opacity 在 2.10 本工程实测不生效 → 会与浮层重叠；transform 派生确定生效）
    const transform = useDerivedValue(() => {
        const row = snapshot.value[rowIndex.value];
        const preview =
            (drag.dragging.value || drag.settling.value) && !drag.landed.value;
        // 越界/未投影 slot，或抓起行（原位按 key 隐藏、由浮层承载）→ 移出画布
        const hidden = !row || (preview && row.key === drag.grabbedKey.value);
        if (hidden) {
            return [{ translateY: OFFSCREEN_Y }];
        }
        return [
            {
                translateY:
                    rowIndex.value * SKIA_ROW_HEIGHT -
                    offsetY.value +
                    shift.value,
            },
        ];
    });

    return (
        <Group transform={transform}>
            <SkiaListItem
                width={width}
                showPosition={showPosition}
                showHandle={showHandle}
                handleColor={palette.handle}
                backgroundColor={
                    selectable ? sel.selectedBackground : 'transparent'
                }
                titleParagraph={titleParagraph}
                titleWidth={tag.titleWidth}
                subtitleParagraph={subtitleParagraph}
                positionParagraph={positionParagraph}
                sourceLabelParagraph={tag.sourceLabelParagraph}
                tagWidth={tag.tagWidth}
                tagLabelWidth={tag.tagLabelWidth}
                tagTransform={tag.tagTransform}
                tagBackground={palette.tagBackground}
                showCheckbox={selectable}
                checkboxFill={sel.checkboxFill}
                checkboxBorder={sel.checkboxBorder}
                checkboxCheck={sel.checkboxCheck}
            />
        </Group>
    );
}

/** 浮起副本：抓起行跟手漂浮（原位已隐藏）；内容按 fromIndex 从快照派生 */
function FloatingRow({
    drag,
    floatingY,
    snapshot,
    width,
    showPosition,
    showHandle,
    selectable,
    selection,
    palette,
}: {
    drag: DragState;
    floatingY: SharedValue<number>;
    snapshot: SharedValue<RowSnapshot[]>;
    width: number;
    showPosition: boolean;
    showHandle: boolean;
    selectable: boolean;
    selection: SelectionState;
    palette: Palette;
}) {
    const { titleParagraph, subtitleParagraph, positionParagraph } =
        useRowParagraphs(snapshot, drag.fromIndex, palette, showPosition);
    const { contentX, contentRight } = rowContentBounds(
        width,
        showPosition,
        showHandle,
        selectable,
    );
    const tag = useTagLayout(
        snapshot,
        drag.fromIndex,
        palette,
        contentX,
        contentRight,
    );
    const sel = useRowSelection(snapshot, drag.fromIndex, selection, palette);
    // 不可见时移出画布（同 RowSlot：不靠 Group opacity）
    const transform = useDerivedValue(() => {
        const visible =
            (drag.dragging.value || drag.settling.value) && !drag.landed.value;
        return [{ translateY: visible ? floatingY.value : OFFSCREEN_Y }];
    });
    // 浮起行保留选择语义：选中 → primarySoft、否则 → 抬起色 surface
    const floatingBg = useDerivedValue(() =>
        sel.selected.value
            ? palette.selectedBackground
            : palette.floatingBackground,
    );

    return (
        <Group transform={transform}>
            <SkiaListItem
                width={width}
                showPosition={showPosition}
                showHandle={showHandle}
                handleColor={palette.handle}
                backgroundColor={floatingBg}
                titleParagraph={titleParagraph}
                titleWidth={tag.titleWidth}
                subtitleParagraph={subtitleParagraph}
                positionParagraph={positionParagraph}
                sourceLabelParagraph={tag.sourceLabelParagraph}
                tagWidth={tag.tagWidth}
                tagLabelWidth={tag.tagLabelWidth}
                tagTransform={tag.tagTransform}
                tagBackground={palette.tagBackground}
                showCheckbox={selectable}
                checkboxFill={sel.checkboxFill}
                checkboxBorder={sel.checkboxBorder}
                checkboxCheck={sel.checkboxCheck}
            />
        </Group>
    );
}

export function ReorderableMediaList<T>({
    data,
    keyExtractor,
    getItemContent,
    showPosition = false,
    onReorder,
    onDragStart,
    onDragEnd,
    dragEnabled = true,
    selectable = false,
    selectedKeys,
    onToggleSelect,
    ListEmptyComponent,
    style,
}: ReorderableMediaListProps<T>) {
    const colors = useColors();
    const [size, setSize] = useState({ width: 0, height: 0 });

    const scrollRef = useAnimatedRef<Animated.ScrollView>();
    const offsetY = useSharedValue(0);
    const snapshot = useSharedValue<RowSnapshot[]>([]);
    const maxOffset = useSharedValue(0);
    const scrollActive = useSharedValue(false);
    const viewportH = useSharedValue(0);
    const itemCountSV = useSharedValue(0);

    // 拖拽会话共享态（全 UI 线程）
    const dragging = useSharedValue(false);
    const settling = useSharedValue(false);
    const pendingDragIndex = useSharedValue(-1);
    const dragFromIndex = useSharedValue(-1);
    const settleToIndex = useSharedValue(-1);
    const grabbedKeyValue = useSharedValue('');
    const floatingY = useSharedValue(0);
    const floatingStartY = useSharedValue(0);
    // 落点行号：拖拽中随浮层中心派生，settling 期冻结为 settleToIndex
    const hoverIndex = useDerivedValue(() => {
        if (dragging.value) {
            const center =
                floatingY.value + offsetY.value + SKIA_ROW_HEIGHT / 2;
            return Math.min(
                Math.max(Math.floor(center / SKIA_ROW_HEIGHT), 0),
                itemCountSV.value - 1,
            );
        }
        return settling.value ? settleToIndex.value : -1;
    });
    // 数据落定：settling 期目标位 key 已是被拖行 → 让位/隐藏/浮层在同一派生链原子归位
    const landed = useDerivedValue(() => {
        if (!settling.value) {
            return false;
        }
        const row = snapshot.value[settleToIndex.value];
        return !!row && row.key === grabbedKeyValue.value;
    });
    const drag = useMemo<DragState>(
        () => ({
            dragging,
            settling,
            landed,
            fromIndex: dragFromIndex,
            hoverIndex,
            grabbedKey: grabbedKeyValue,
        }),
        [
            dragging,
            settling,
            landed,
            dragFromIndex,
            hoverIndex,
            grabbedKeyValue,
        ],
    );

    // 多选 UI 线程镜像（基线 base + 例外集 overrides）
    const selectionBase = useSharedValue(false);
    const selectOverrides = useSharedValue<Record<string, boolean>>({});
    const selection = useMemo<SelectionState>(
        () => ({ base: selectionBase, overrides: selectOverrides }),
        [selectionBase, selectOverrides],
    );

    // 拖拽跨帧只读的最新值装进 ref → 会话回调引用稳定 → pan 不重建
    const dataRef = useRef(data);
    dataRef.current = data;
    const callbacksRef = useRef({
        keyExtractor,
        onReorder,
        onDragStart,
        onDragEnd,
        onToggleSelect,
    });
    callbacksRef.current = {
        keyExtractor,
        onReorder,
        onDragStart,
        onDragEnd,
        onToggleSelect,
    };
    /** 抓起行的稳定 key（onActivate 从 snapshot 捕获、同一 key 传给 JS，落点按它反查 from） */
    const grabbedKeyRef = useRef('');
    /** 已成功建立会话，用于 onDragStart/onDragEnd 严格配对 + 落点会话有效性守卫 */
    const sessionActiveRef = useRef(false);
    /** 落定兜底定时器：父级未回写数据时强制释放 preview */
    const settleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const mountedRef = useRef(true);

    const clearSettleTimeout = useCallback(() => {
        if (settleTimeoutRef.current !== null) {
            clearTimeout(settleTimeoutRef.current);
            settleTimeoutRef.current = null;
        }
    }, []);
    useEffect(
        () => () => {
            mountedRef.current = false;
            clearSettleTimeout();
        },
        [clearSettleTimeout],
    );

    // JS 一次性把 data 投影成轻量快照放进 shared value（禁把整个业务对象送进 UI）
    useEffect(() => {
        snapshot.value = data.map(item => {
            const content = getItemContent(item);
            return {
                key: keyExtractor(item),
                title: content.title,
                subtitle: content.subtitle ?? '',
                sourceLabel: content.sourceLabel ?? '',
            };
        });
    }, [data, getItemContent, keyExtractor, snapshot]);

    // 短按切换选中：worklet 已乐观翻镜像，此处仅回调父受控层
    const handleToggleSelect = useCallback((key: string) => {
        callbacksRef.current.onToggleSelect?.(key);
    }, []);

    // 受控 selectedKeys → UI 镜像（就近基线：全选/全不选 O(1)、少量选中存例外集、多数选中存补集）
    useEffect(() => {
        if (!selectable) {
            selectionBase.value = false;
            selectOverrides.value = {};
            return;
        }
        const keys = selectedKeys ?? EMPTY_SELECTED_KEYS;
        const total = data.length;
        const selectedCount = keys.size;
        if (selectedCount === 0) {
            selectionBase.value = false;
            selectOverrides.value = {};
        } else if (selectedCount >= total) {
            selectionBase.value = true;
            selectOverrides.value = {};
        } else if (selectedCount * 2 <= total) {
            const next: Record<string, boolean> = {};
            keys.forEach(key => {
                next[key] = true;
            });
            selectionBase.value = false;
            selectOverrides.value = next;
        } else {
            // 多数选中：base=true，例外集 = 未选补集（O(n) 遍历、结果小）
            const next: Record<string, boolean> = {};
            for (const item of data) {
                const key = keyExtractor(item);
                if (!keys.has(key)) {
                    next[key] = false;
                }
            }
            selectionBase.value = true;
            selectOverrides.value = next;
        }
    }, [
        selectable,
        selectedKeys,
        data,
        keyExtractor,
        selectionBase,
        selectOverrides,
    ]);

    const itemCount = data.length;
    const contentHeight = itemCount * SKIA_ROW_HEIGHT;
    useEffect(() => {
        itemCountSV.value = itemCount;
    }, [itemCount, itemCountSV]);

    // 内容变短 / 视口变高时，钳制陈旧 offset 并同步原生 ScrollView（否则画到越界行或空白）
    useEffect(() => {
        maxOffset.value = Math.max(0, contentHeight - size.height);
        scrollActive.value = itemCount > 0;
    }, [contentHeight, size.height, itemCount, maxOffset, scrollActive]);
    useAnimatedReaction(
        () => maxOffset.value,
        max => {
            if (offsetY.value > max) {
                offsetY.value = max;
                if (scrollActive.value) {
                    scrollTo(scrollRef, 0, max, false);
                }
            }
        },
    );

    const onScroll = useAnimatedScrollHandler(event => {
        offsetY.value = event.contentOffset.y;
    });

    // 边缘自动滚动：拖拽贴近上/下边缘时 UI 线程逐帧推进 offsetY 并同步原生 ScrollView
    // （虚拟化与让位皆随 offsetY 派生 → 推进 offset 即滚动并带动落点）；仅拖拽中激活
    const autoscroll = useFrameCallback(frame => {
        'worklet';
        if (!dragging.value) {
            return;
        }
        const dt = Math.min(
            frame.timeSincePreviousFrame ?? 16,
            AUTOSCROLL_MAX_DT,
        );
        const vh = viewportH.value;
        const fy = floatingY.value;
        // 边缘带 ~3 行宽（矮视口按比例封顶）；上/下各算深度、重叠时取更深一侧（不恒偏上）
        const edge = Math.min(
            AUTOSCROLL_EDGE_ROWS * SKIA_ROW_HEIGHT,
            vh * AUTOSCROLL_EDGE_MAX_FRACTION,
        );
        const topDepth = fy < edge ? (edge - fy) / edge : 0;
        const bottomDepth =
            fy > vh - SKIA_ROW_HEIGHT - edge
                ? (fy - (vh - SKIA_ROW_HEIGHT - edge)) / edge
                : 0;
        let dir = 0;
        let depth = 0;
        if (topDepth > 0 && topDepth >= bottomDepth) {
            dir = -1;
            depth = topDepth;
        } else if (bottomDepth > 0) {
            dir = 1;
            depth = bottomDepth;
        }
        if (dir === 0) {
            return;
        }
        // ease-in（深度平方）：进带处几乎静止、越贴边加速越快，起速为 0
        depth = Math.min(1, depth);
        const speed = AUTOSCROLL_MAX_SPEED * depth * depth;
        const next = Math.min(
            Math.max(offsetY.value + dir * speed * (dt / 1000), 0),
            maxOffset.value,
        );
        if (next !== offsetY.value) {
            offsetY.value = next;
            scrollTo(scrollRef, 0, next, false);
        }
    }, false);
    // frame callback 句柄装进 ref → begin/endDragSession 引用稳定（不重建 pan）
    const autoscrollRef = useRef(autoscroll);
    autoscrollRef.current = autoscroll;

    // 抓起：记稳定 key（UI 已捕获、此处沿用同一 key）+ 触发 onDragStart
    const beginDragSession = useCallback((key: string) => {
        // 起手到本回调之间数据已变（清空/移除该行）→ 放弃本次会话，免无配对 onDragStart / 空跑帧回调
        if (
            !mountedRef.current ||
            !key ||
            !dataRef.current.some(
                item => callbacksRef.current.keyExtractor(item) === key,
            )
        ) {
            return;
        }
        sessionActiveRef.current = true;
        grabbedKeyRef.current = key;
        autoscrollRef.current.setActive(true);
        callbacksRef.current.onDragStart?.(key);
    }, []);
    // 手指松开即结束会话（与 onDragStart 严格配对，独立于内部 settling 视觉）
    const endDragSession = useCallback(() => {
        autoscrollRef.current.setActive(false);
        if (sessionActiveRef.current) {
            sessionActiveRef.current = false;
            callbacksRef.current.onDragEnd?.();
        }
    }, []);
    const commitDrop = useCallback((to: number) => {
        // 会话未成功建立 → 不用陈旧 grabbedKey 误重排
        if (!mountedRef.current || !sessionActiveRef.current) {
            return;
        }
        const key = grabbedKeyRef.current;
        const from = dataRef.current.findIndex(
            item => callbacksRef.current.keyExtractor(item) === key,
        );
        if (from >= 0 && to >= 0 && from !== to) {
            callbacksRef.current.onReorder({ key, from, to });
        }
    }, []);
    // 释放落定 preview（视觉收尾，不碰会话）：数据落定 reaction 命中、兜底超时、或数据清空时调
    const clearSettlePreview = useCallback(() => {
        clearSettleTimeout();
        settling.value = false;
        dragFromIndex.value = -1;
    }, [clearSettleTimeout, settling, dragFromIndex]);
    const startSettleTimeout = useCallback(() => {
        clearSettleTimeout();
        settleTimeoutRef.current = setTimeout(() => {
            settleTimeoutRef.current = null;
            clearSettlePreview();
        }, SETTLE_TIMEOUT_MS);
    }, [clearSettleTimeout, clearSettlePreview]);

    // 拖拽中数据被清空：内部手势节点会随之卸载、onFinalize 可能不到 → 兜底复位会话与 preview
    useEffect(() => {
        if (itemCount === 0) {
            dragging.value = false;
            pendingDragIndex.value = -1;
            clearSettlePreview();
            endDragSession();
        }
    }, [
        itemCount,
        dragging,
        pendingDragIndex,
        clearSettlePreview,
        endDragSession,
    ]);

    // 落定握手：数据落定（landed 派生翻真）后回 JS 收尾 preview；视觉已在派生链原子归位
    useAnimatedReaction(
        () => landed.value,
        (isLanded, prev) => {
            if (isLanded && !prev) {
                scheduleOnRN(clearSettlePreview);
            }
        },
    );

    // 列表级 pan：hitSlop 限定尾部把手条 → 条外交原生滚动、条内与滚动经 requireToFail 仲裁
    const pan = usePanGesture(
        useMemo<NonNullable<Parameters<typeof usePanGesture>[0]>>(
            () => ({
                enabled: dragEnabled,
                maxPointers: 1,
                hitSlop: { right: 0, width: DRAG_HANDLE_WIDTH },
                onBegin: event => {
                    'worklet';
                    const raw = Math.floor(
                        (event.y + offsetY.value) / SKIA_ROW_HEIGHT,
                    );
                    // 空白/越界拒绝起手
                    pendingDragIndex.value =
                        raw >= 0 && raw < itemCountSV.value ? raw : -1;
                },
                onActivate: () => {
                    'worklet';
                    const idx = pendingDragIndex.value;
                    // 落定 preview 未结束时拒绝新拖拽（避免会话/定时器交叠）
                    if (idx < 0 || settling.value) {
                        return;
                    }
                    const key = snapshot.value[idx]?.key ?? '';
                    if (!key) {
                        return;
                    }
                    const maxY = Math.max(0, viewportH.value - SKIA_ROW_HEIGHT);
                    // 起点钳进视口：抓部分可见的首/末行不留跟手死区（否则被 clamp 吞掉一段位移）
                    const start = Math.min(
                        Math.max(idx * SKIA_ROW_HEIGHT - offsetY.value, 0),
                        maxY,
                    );
                    floatingStartY.value = start;
                    floatingY.value = start;
                    grabbedKeyValue.value = key;
                    dragFromIndex.value = idx;
                    dragging.value = true;
                    scheduleOnRN(beginDragSession, key);
                },
                onUpdate: event => {
                    'worklet';
                    if (!dragging.value) {
                        return;
                    }
                    const maxY = Math.max(0, viewportH.value - SKIA_ROW_HEIGHT);
                    floatingY.value = Math.min(
                        Math.max(floatingStartY.value + event.translationY, 0),
                        maxY,
                    );
                },
                onDeactivate: event => {
                    'worklet';
                    if (!dragging.value || event.canceled) {
                        return;
                    }
                    const to = hoverIndex.value;
                    // 原位落下：不进入 settle，onFinalize 直接收尾
                    if (to < 0 || to === dragFromIndex.value) {
                        return;
                    }
                    settleToIndex.value = to;
                    // 浮层吸附到目标槽：释放时与真实行同位，无缝接管
                    floatingY.value = to * SKIA_ROW_HEIGHT - offsetY.value;
                    settling.value = true;
                    scheduleOnRN(commitDrop, to);
                    scheduleOnRN(startSettleTimeout);
                },
                onFinalize: () => {
                    'worklet';
                    const wasDragging = dragging.value;
                    dragging.value = false;
                    pendingDragIndex.value = -1;
                    if (wasDragging) {
                        // 手指松开即结束会话（onDragEnd）；settling 期保留 fromIndex 供 preview
                        scheduleOnRN(endDragSession);
                        if (!settling.value) {
                            dragFromIndex.value = -1;
                        }
                    }
                },
            }),
            [
                dragEnabled,
                beginDragSession,
                commitDrop,
                endDragSession,
                startSettleTimeout,
                offsetY,
                snapshot,
                itemCountSV,
                pendingDragIndex,
                viewportH,
                floatingStartY,
                floatingY,
                hoverIndex,
                dragging,
                settling,
                dragFromIndex,
                settleToIndex,
                grabbedKeyValue,
            ],
        ),
    );

    // 多选整行 tap：短按切换选中（乐观翻镜像 + 通知父）；移动超阈值即失败让位滚动
    const tap = useTapGesture(
        useMemo<NonNullable<Parameters<typeof useTapGesture>[0]>>(
            () => ({
                enabled: selectable,
                maxDistance: SELECT_TAP_MAX_DISTANCE,
                onActivate: event => {
                    'worklet';
                    const row = Math.floor(
                        (event.y + offsetY.value) / SKIA_ROW_HEIGHT,
                    );
                    if (row < 0 || row >= itemCountSV.value) {
                        return;
                    }
                    const key = snapshot.value[row]?.key;
                    if (!key) {
                        return;
                    }
                    // 乐观翻转例外集（不等 JS 往返）；typeof 守卫避原型键误读
                    const cur = selectOverrides.value;
                    const flag = cur[key];
                    const selected =
                        typeof flag === 'boolean' ? flag : selectionBase.value;
                    selectOverrides.value = { ...cur, [key]: !selected };
                    scheduleOnRN(handleToggleSelect, key);
                },
            }),
            [
                selectable,
                offsetY,
                snapshot,
                itemCountSV,
                selectOverrides,
                selectionBase,
                handleToggleSelect,
            ],
        ),
    );
    // pan 优先（把手拖拽）、tap 次之（整行选中）；非 selectable 时 tap enabled=false 退化为纯 pan
    const gesture = useExclusiveGestures(pan, tap);

    // 序号与 checkbox 互斥：selectable 时强制不显序号（checkbox 占 leading），不靠调用方约定
    const effectiveShowPosition = showPosition && !selectable;

    const slotCount =
        size.height > 0
            ? Math.ceil(size.height / SKIA_ROW_HEIGHT) + OVERSCAN
            : 0;
    const slots = useMemo(
        () => Array.from({ length: slotCount }, (_, i) => i),
        [slotCount],
    );

    const palette = useMemo<Palette>(
        () => ({
            title: colors.text,
            subtitle: colors.textSecondary,
            handle: colors.textSecondary,
            floatingBackground: colors.surface,
            tagText: colors.textSecondary,
            tagBackground: colors.surfaceVariant,
            selectedBackground: colors.primarySoft,
            checkboxChecked: colors.primary,
            checkboxUncheckedBorder: colors.border,
            checkboxCheckmark: colors.onPrimary,
        }),
        [colors],
    );

    const onLayout = (event: LayoutChangeEvent) => {
        const { width, height } = event.nativeEvent.layout;
        viewportH.value = height;
        setSize(prev =>
            prev.width === width && prev.height === height
                ? prev
                : { width, height },
        );
    };

    return (
        <View style={[styles.container, style]} onLayout={onLayout}>
            {itemCount === 0 ? (
                ListEmptyComponent ?? null
            ) : (
                <>
                    <GestureDetector gesture={gesture}>
                        <AnimatedScrollView
                            ref={scrollRef}
                            style={StyleSheet.absoluteFill}
                            onScroll={onScroll}
                            scrollEventThrottle={16}
                            requireToFail={pan}
                        >
                            <View style={{ height: contentHeight }} />
                        </AnimatedScrollView>
                    </GestureDetector>
                    {size.width > 0 && slotCount > 0 ? (
                        <View
                            style={StyleSheet.absoluteFill}
                            pointerEvents="none"
                        >
                            <Canvas style={styles.canvas}>
                                {slots.map(i => (
                                    <RowSlot
                                        key={i}
                                        slot={i}
                                        offsetY={offsetY}
                                        snapshot={snapshot}
                                        drag={drag}
                                        width={size.width}
                                        showPosition={effectiveShowPosition}
                                        showHandle={dragEnabled}
                                        selectable={selectable}
                                        selection={selection}
                                        palette={palette}
                                    />
                                ))}
                                <FloatingRow
                                    drag={drag}
                                    floatingY={floatingY}
                                    snapshot={snapshot}
                                    width={size.width}
                                    showPosition={effectiveShowPosition}
                                    showHandle={dragEnabled}
                                    selectable={selectable}
                                    selection={selection}
                                    palette={palette}
                                />
                            </Canvas>
                        </View>
                    ) : null}
                </>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    canvas: { flex: 1 },
});
