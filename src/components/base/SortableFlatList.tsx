/**
 * 支持长按拖拽排序的flatlist，右边加个固定的按钮，拖拽排序。
 * 考虑到方便实现+节省性能，整个app内的拖拽排序都遵守以下实现。
 * 点击会出现
 */

import globalStyle from '@/constants/globalStyle';
import {iconSizeConst} from '@/constants/uiConst';
import useTextColor from '@/hooks/useTextColor';
import rpx from '@/utils/rpx';
import {FlashList} from '@shopify/flash-list';
import React, {
    ForwardedRef,
    forwardRef,
    memo,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import {LayoutRectangle, Pressable, StyleSheet, View} from 'react-native';
import {
    runOnJS,
    useDerivedValue,
    useSharedValue,
} from 'react-native-reanimated';
import Icon from '@/components/base/icon.tsx';

const defaultZIndex = 10;

interface ISortableFlatListProps<T> {
    data: T[];
    renderItem: (props: {item: T; index: number}) => JSX.Element;
    // 高度
    itemHeight: number;
    itemJustifyContent?:
        | 'flex-start'
        | 'flex-end'
        | 'center'
        | 'space-between'
        | 'space-around'
        | 'space-evenly';
    // 滚动list距离顶部的距离, 这里写的不好
    marginTop: number;
    /** 拖拽时的背景色 */
    activeBackgroundColor?: string;
    /** 交换结束 */
    onSortEnd?: (newData: T[]) => void;
}

export default function SortableFlatList<T extends any = any>(
    props: ISortableFlatListProps<T>,
) {
    const {
        data,
        renderItem,
        itemHeight,
        itemJustifyContent,
        marginTop,
        activeBackgroundColor,
        onSortEnd,
    } = props;

    // 不要干扰原始数据
    const [_data, _setData] = useState([...(data ?? [])]);
    // 是否禁止滚动
    const [scrollEnabled, setScrollEnabled] = useState(true);
    // 是否处在激活状态, -1表示无，其他表示当前激活的下标
    const activeRef = useRef(-1);
    const [activeItem, setActiveItem] = useState<T | null>(null);

    const layoutRef = useRef<LayoutRectangle>();
    // listref
    const listRef = useRef<FlashList<T> | null>(null);
    // fakeref
    const fakeItemRef = useRef<View | null>(null);
    // contentoffset
    const contentOffsetYRef = useRef<number>(-1);
    const targetOffsetYRef = useRef<number>(0);

    const direction = useSharedValue(0);

    useEffect(() => {
        _setData([...(data ?? [])]);
    }, [data]);

    const initDragPageY = useRef<number>(0);
    const initDragLocationY = useRef<number>(0);
    const offsetRef = useRef<number>(0);

    //#region 滚动
    const scrollingRef = useRef(false);

    // 列表整体的高度
    const listContentHeight = useMemo(
        () => itemHeight * data.length,
        [data, itemHeight],
    );

    function scrollToTarget(forceScroll = false) {
        // 未选中
        if (activeRef.current === -1) {
            scrollingRef.current = false;
            return;
        }

        // 滚动中就不滚了 /
        if (scrollingRef.current && !forceScroll) {
            scrollingRef.current = true;
            return;
        }
        // 方向是0
        if (direction.value === 0) {
            scrollingRef.current = false;
            return;
        }

        const nextTarget =
            Math.sign(direction.value) *
                Math.max(Math.abs(direction.value), 0.3) *
                300 +
            contentOffsetYRef.current;
        // 当前到极限了
        if (
            (contentOffsetYRef.current <= 2 &&
                nextTarget < contentOffsetYRef.current) ||
            (contentOffsetYRef.current >=
                listContentHeight - (layoutRef.current?.height ?? 0) - 2 &&
                nextTarget > contentOffsetYRef.current)
        ) {
            scrollingRef.current = false;
            return;
        }
        scrollingRef.current = true;
        // 超出区域
        targetOffsetYRef.current = Math.min(
            Math.max(0, nextTarget),
            listContentHeight - (layoutRef.current?.height ?? 0),
        );
        listRef.current?.scrollToOffset({
            animated: true,
            offset: targetOffsetYRef.current,
        });
    }

    useDerivedValue(() => {
        // 正在滚动
        if (scrollingRef.current) {
            return;
        } else if (direction.value !== 0) {
            // 开始滚动
            runOnJS(scrollToTarget)();
        }
    }, []);

    //#endregion

    return (
        <View style={globalStyle.fwflex1}>
            {/* 纯展示 */}
            <FakeFlatListItem
                ref={_ => (fakeItemRef.current = _)}
                backgroundColor={activeBackgroundColor}
                renderItem={renderItem}
                itemHeight={itemHeight}
                item={activeItem}
                itemJustifyContent={itemJustifyContent}
            />
            <FlashList
                scrollEnabled={scrollEnabled}
                ref={_ => {
                    listRef.current = _;
                }}
                onLayout={evt => {
                    layoutRef.current = evt.nativeEvent.layout;
                }}
                data={_data}
                estimatedItemSize={itemHeight}
                scrollEventThrottle={16}
                onTouchStart={e => {
                    if (activeRef.current !== -1) {
                        // 相对于整个页面顶部的距离
                        initDragPageY.current = e.nativeEvent.pageY;
                        initDragLocationY.current = e.nativeEvent.locationY;
                    }
                }}
                onTouchMove={e => {
                    if (activeRef.current !== -1) {
                        offsetRef.current =
                            e.nativeEvent.pageY -
                            (marginTop ?? layoutRef.current?.y ?? 0) -
                            itemHeight / 2;

                        if (offsetRef.current < 0) {
                            offsetRef.current = 0;
                        } else if (
                            offsetRef.current >
                            (layoutRef.current?.height ?? 0) - itemHeight
                        ) {
                            offsetRef.current =
                                (layoutRef.current?.height ?? 0) - itemHeight;
                        }
                        fakeItemRef.current!.setNativeProps({
                            top: offsetRef.current,
                            opacity: 1,
                            zIndex: 100,
                        });

                        // 如果超出范围，停止
                        if (offsetRef.current < itemHeight * 2) {
                            // 上滑
                            direction.value =
                                offsetRef.current / itemHeight / 2 - 1;
                        } else if (
                            offsetRef.current >
                            (layoutRef.current?.height ?? 0) - 3 * itemHeight
                        ) {
                            // 下滑
                            direction.value =
                                (offsetRef.current -
                                    (layoutRef.current?.height ?? 0) +
                                    3 * itemHeight) /
                                itemHeight /
                                2;
                        } else {
                            // 不滑动
                            direction.value = 0;
                        }
                    }
                }}
                onTouchEnd={e => {
                    if (activeRef.current !== -1) {
                        // 计算最终的位置，触发onSortEnd
                        let index = activeRef.current;
                        if (contentOffsetYRef.current !== -1) {
                            index = Math.round(
                                (contentOffsetYRef.current +
                                    offsetRef.current) /
                                    itemHeight,
                            );
                        } else {
                            // 拖动的距离
                            index =
                                activeRef.current +
                                Math.round(
                                    (e.nativeEvent.pageY -
                                        initDragPageY.current +
                                        initDragLocationY.current) /
                                        itemHeight,
                                );
                        }
                        index = Math.min(data.length, Math.max(index, 0));
                        // from: activeRef.current to: index
                        if (activeRef.current !== index) {
                            let nData = _data
                                .slice(0, activeRef.current)
                                .concat(_data.slice(activeRef.current + 1));
                            nData.splice(index, 0, activeItem as T);
                            onSortEnd?.(nData);
                            // 测试用，正式时移除掉
                            // _setData(nData);
                        }
                    }
                    scrollingRef.current = false;
                    activeRef.current = -1;
                    setScrollEnabled(true);
                    setActiveItem(null);
                    fakeItemRef.current!.setNativeProps({
                        top: 0,
                        opacity: 0,
                        zIndex: -1,
                    });
                }}
                onTouchCancel={() => {
                    // todo: 滑动很快的时候会触发取消，native的flatlist就这样
                    activeRef.current = -1;
                    scrollingRef.current = false;
                    setScrollEnabled(true);
                    setActiveItem(null);
                    fakeItemRef.current!.setNativeProps({
                        top: 0,
                        opacity: 0,
                        zIndex: -1,
                    });
                    contentOffsetYRef.current = -1;
                }}
                onScroll={e => {
                    contentOffsetYRef.current = e.nativeEvent.contentOffset.y;
                    if (
                        activeRef.current !== -1 &&
                        Math.abs(
                            contentOffsetYRef.current -
                                targetOffsetYRef.current,
                        ) < 2
                    ) {
                        scrollToTarget(true);
                    }
                }}
                renderItem={({item, index}) => {
                    return (
                        <SortableFlatListItem
                            setScrollEnabled={setScrollEnabled}
                            activeRef={activeRef}
                            renderItem={renderItem}
                            item={item}
                            index={index}
                            setActiveItem={setActiveItem}
                            itemJustifyContent={itemJustifyContent}
                            itemHeight={itemHeight}
                        />
                    );
                }}
            />
        </View>
    );
}

interface ISortableFlatListItemProps<T extends any = any> {
    item: T;
    index: number;
    // 高度
    itemHeight: number;
    itemJustifyContent?:
        | 'flex-start'
        | 'flex-end'
        | 'center'
        | 'space-between'
        | 'space-around'
        | 'space-evenly';
    setScrollEnabled: (scrollEnabled: boolean) => void;
    renderItem: (props: {item: T; index: number}) => JSX.Element;
    setActiveItem: (item: T | null) => void;
    activeRef: React.MutableRefObject<number>;
}
function _SortableFlatListItem(props: ISortableFlatListItemProps) {
    const {
        itemHeight,
        setScrollEnabled,
        renderItem,
        setActiveItem,
        itemJustifyContent,
        item,
        index,
        activeRef,
    } = props;

    // 省一点性能，height是顺着传下来的，放ref就好了
    const styleRef = useRef(
        StyleSheet.create({
            viewWrapper: {
                height: itemHeight,
                width: '100%',
                flexDirection: 'row',
                justifyContent: itemJustifyContent ?? 'flex-end',
                zIndex: defaultZIndex,
            },
            btn: {
                height: itemHeight,
                justifyContent: 'center',
                alignItems: 'center',
                position: 'absolute',
                top: 0,
                right: 0,
                width: rpx(100),
                textAlignVertical: 'center',
            },
        }),
    );
    const textColor = useTextColor();

    return (
        <View style={styleRef.current.viewWrapper}>
            {renderItem({item, index})}
            <Pressable
                onTouchStart={() => {
                    if (activeRef.current !== -1) {
                        return;
                    }
                    /** 使用ref避免其它组件重新渲染; 由于事件冒泡，这里会先触发 */
                    activeRef.current = index;
                    /** 锁定滚动 */
                    setScrollEnabled(false);
                    setActiveItem(item);
                }}
                style={styleRef.current.btn}>
                <Icon
                    name="bars-3"
                    size={iconSizeConst.normal}
                    color={textColor}
                />
            </Pressable>
        </View>
    );
}

const SortableFlatListItem = memo(
    _SortableFlatListItem,
    (prev, curr) => prev.index === curr.index && prev.item === curr.item,
);

const FakeFlatListItem = forwardRef(function (
    props: Pick<
        ISortableFlatListItemProps,
        'itemHeight' | 'renderItem' | 'item' | 'itemJustifyContent'
    > & {
        backgroundColor?: string;
    },
    ref: ForwardedRef<View>,
) {
    const {itemHeight, renderItem, item, backgroundColor, itemJustifyContent} =
        props;

    const styleRef = useRef(
        StyleSheet.create({
            viewWrapper: {
                height: itemHeight,
                width: '100%',
                flexDirection: 'row',
                justifyContent: itemJustifyContent ?? 'flex-end',
                zIndex: defaultZIndex,
            },
            btn: {
                height: itemHeight,
                paddingHorizontal: rpx(28),
                justifyContent: 'center',
                alignItems: 'center',
                position: 'absolute',
                top: 0,
                right: 0,
                width: rpx(100),
                textAlignVertical: 'center',
            },
        }),
    );
    const textColor = useTextColor();

    return (
        <View
            ref={ref}
            style={[
                styleRef.current.viewWrapper,
                style.activeItemDefault,
                backgroundColor ? {backgroundColor} : {},
            ]}>
            {item ? renderItem({item, index: -1}) : null}
            <Pressable style={styleRef.current.btn}>
                <Icon
                    name="bars-3"
                    size={iconSizeConst.normal}
                    color={textColor}
                />
            </Pressable>
        </View>
    );
});

const style = StyleSheet.create({
    activeItemDefault: {
        opacity: 0,
        zIndex: -1,
        position: 'absolute',
        top: 0,
        left: 0,
    },
});
