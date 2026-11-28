import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useScreenReaderEnabled } from '@/hooks/useScreenReaderEnabled';

import {
    buildKeyIndex,
    isTargetOffscreen,
    scrollPhaseEffect,
    shouldShowLocate,
    visibleRangeOf,
    SCROLL_PHASE_PROPS,
    type ScrollPhaseEvent,
    type VisibleRange,
} from './locateRules';

import type { FlashListRef, ViewToken } from '@shopify/flash-list';

/**
 * 滚动停止后浮标的停留时长（ms）
 *
 * 无对应 token：`duration` 那组是动画时长（150 / 250 / 400），这是「停留多久再淡出」，
 * 不是同一件事。3s 沿用旧版行为
 */
const DWELL_MS = 3000;

/** 一项露出多少算「可见」：过半即算，避免贴边半行反复翻转判定 */
const VISIBLE_PERCENT_THRESHOLD = 50;

/** 提到模块级：每渲染新建字面量没有意义（FlashList v2 只在构造 ViewabilityManager 时读一次） */
const VIEWABILITY_CONFIG = {
    itemVisiblePercentThreshold: VISIBLE_PERCENT_THRESHOLD,
} as const;

export interface LocateCurrentHandle<T> {
    /** 挂到 FlashList 的 ref */
    listRef: React.RefObject<FlashListRef<T> | null>;
    /** 浮标该不该显示 */
    visible: boolean;
    /** 点浮标：跳到当前曲 */
    locate: () => void;
    /**
     * 展开到 FlashList 上的 props（可视性 + 滚动起止）
     *
     * 四个滚动 prop 的名字从 SCROLL_PHASE_PROPS 推导、不再手写一份：
     * 手写的话少一个 key 有 tsc 拦（返回对象缺属性），**多**一个拦不住——
     * spread 不做 excess property 检查，多出来的会静默透给 FlashList
     */
    listProps: Record<keyof typeof SCROLL_PHASE_PROPS, () => void> & {
        onViewableItemsChanged: (info: {
            viewableItems: ViewToken<T>[];
        }) => void;
        viewabilityConfig: typeof VIEWABILITY_CONFIG;
    };
}

/**
 * 「定位到当前曲」浮标的接线：可视性上报 + 滚动起止 + 停留计时
 *
 * 判定本身在 ./locateRules 里（纯函数、可断言），这里只负责把输入喂给它。
 *
 * **可视区间存在 ref 里、只有布尔进 state**，这是硬性要求不是优化：
 * FlashList 每个 scroll 事件都会重算可视性（RecyclerView 的 computeItemViewability），
 * 可视集合一变就回调。若把区间放进 state，滚动期每跨一行就是一趟列表重渲染，
 * 而 ViewHolder 的 memo 比较 `renderItem` 引用——MediaList 一渲染，
 * 所有已挂载的行都会跟着重渲染（每行还各带两个 jotai 订阅）。
 * 改动前 MediaList 在滚动中重渲染次数是 0（onScroll 走 reanimated UI 线程），
 * 这条要守住。改成布尔后 React 在值相同时自行 bail out，一次手势最多翻一两次
 *
 * 「当前曲是谁」由调用方以 key 传进来、不在这里读播放器：components 是纯 UI 层，
 * 不能 import core（depcruise 的 components-no-business 会拦）
 */
export function useLocateCurrent<T>({
    enabled,
    data,
    keyExtractor,
    targetKey,
}: {
    enabled: boolean;
    data: readonly T[];
    keyExtractor: (item: T, index: number) => string;
    /** 要定位到的那一项的 key（本仓即当前曲的 mediaKey）；无则浮标不出现 */
    targetKey: string | null;
}): LocateCurrentHandle<T> {
    const listRef = useRef<FlashListRef<T> | null>(null);
    // 不开浮标的列表不该为此挂一个原生无障碍监听（MediaList 是全仓列表的底座）
    const screenReader = useScreenReaderEnabled(enabled);
    const [targetOffscreen, setTargetOffscreen] = useState(false);
    const [recentlyScrolled, setRecentlyScrolled] = useState(false);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const visibleRange = useRef<VisibleRange | null>(null);
    /** 上一次滚动事件的结论：读屏关掉后据此判断该不该把计时补回来 */
    const lastEffect = useRef<ReturnType<typeof scrollPhaseEffect> | null>(
        null,
    );

    const keyIndex = useMemo(
        () => (enabled ? buildKeyIndex(data, keyExtractor) : null),
        [enabled, data, keyExtractor],
    );
    const currentIndex =
        targetKey != null && keyIndex != null
            ? keyIndex.get(targetKey) ?? null
            : null;
    // 可视性回调要恒定引用，又要读到最新下标：经 ref 取，不进回调的依赖。
    // 在 effect 里同步而非渲染期直接赋值——渲染期写 ref 会把「尚未提交」的下标
    // 发布给已提交的事件回调（渲染被放弃时两者就对不上了）
    const currentIndexRef = useRef(currentIndex);

    const clearTimer = useCallback(() => {
        if (timer.current != null) {
            clearTimeout(timer.current);
            timer.current = null;
        }
    }, []);

    // 卸载时清计时器：停留期内离屏会留一个指向已卸载组件的 setState
    useEffect(() => clearTimer, [clearTimer]);

    // 切歌 / 换数据后目标下标变了：先把下标发布给回调，再用手上的区间立刻重判一次
    // （可视性未必会再上报）。不开浮标时整条跳过，连一次同值 setState 都不发
    useEffect(() => {
        if (!enabled) {
            return;
        }
        currentIndexRef.current = currentIndex;
        setTargetOffscreen(
            isTargetOffscreen(currentIndex, visibleRange.current),
        );
    }, [enabled, currentIndex]);

    /**
     * 起算停留计时；读屏开启时不计时（常驻），见下方 effect
     */
    const startDwell = useCallback(() => {
        clearTimer();
        if (screenReader) {
            return;
        }
        timer.current = setTimeout(() => {
            timer.current = null;
            setRecentlyScrolled(false);
        }, DWELL_MS);
    }, [clearTimer, screenReader]);

    /**
     * 读屏开启时不淡出、常驻：淡出对读屏用户没有意义，反而让按钮从焦点顺序里消失。
     * 放在 effect 里而不是只在起算时判一次——用户可能在计时进行中才打开 TalkBack，
     * 那一趟已经排下的计时得撤掉。
     *
     * 反方向也要管：**读屏关掉后要把停留计时补回来**，否则「开读屏→关读屏」之后
     * recentlyScrolled 会永远停在 true、浮标常驻到下一次滚动或点击
     */
    useEffect(() => {
        if (screenReader) {
            clearTimer();
            return;
        }
        // 读屏关掉：若上一次滚动事件是「停下」、且浮标此刻还亮着，把被撤掉的停留计时补回来
        // （已经淡出的就别再排一趟——那一趟到点只是把 false 再写一次）
        if (lastEffect.current?.startDwell === true && recentlyScrolled) {
            startDwell();
        }
    }, [screenReader, clearTimer, startDwell, recentlyScrolled]);

    const onScrollPhase = useCallback(
        (event: ScrollPhaseEvent) => {
            const effect = scrollPhaseEffect(event);
            lastEffect.current = effect;
            clearTimer();
            setRecentlyScrolled(effect.recentlyScrolled);
            if (effect.startDwell) {
                startDwell();
            }
        },
        [clearTimer, startDwell],
    );

    const onViewableItemsChanged = useCallback(
        ({ viewableItems }: { viewableItems: ViewToken<T>[] }) => {
            visibleRange.current = visibleRangeOf(viewableItems);
            // 只把布尔推进 state：同值时 React 自行 bail out，滚动期不再逐行重渲染
            setTargetOffscreen(
                isTargetOffscreen(
                    currentIndexRef.current,
                    visibleRange.current,
                ),
            );
        },
        [],
    );

    const locate = useCallback(() => {
        if (currentIndex === null) {
            return;
        }
        // 不做动画：几千首的列表动画滚动既慢又容易 jank，诉求本就是「马上到」
        // 居中落位：贴顶会让当前曲压在沉浸顶栏下沿（集合详情页的列表是全幅铺在栏后的）
        listRef.current?.scrollToIndex({
            index: currentIndex,
            animated: false,
            viewPosition: 0.5,
        });
        // 点完就收：已经到了，留着只是挡住刚定位到的那一行
        clearTimer();
        setRecentlyScrolled(false);
    }, [currentIndex, clearTimer]);

    // 按 SCROLL_PHASE_PROPS 生成四个 handler：绑定方向由那张表负责、已被断言钉住
    const scrollHandlers = useMemo(
        () =>
            Object.fromEntries(
                Object.entries(SCROLL_PHASE_PROPS).map(([prop, event]) => [
                    prop,
                    () => onScrollPhase(event),
                ]),
            ) as Record<keyof typeof SCROLL_PHASE_PROPS, () => void>,
        [onScrollPhase],
    );

    return {
        listRef,
        visible:
            enabled && shouldShowLocate({ targetOffscreen, recentlyScrolled }),
        locate,
        listProps: {
            onViewableItemsChanged,
            viewabilityConfig: VIEWABILITY_CONFIG,
            ...scrollHandlers,
        },
    };
}
