/**
 * 支持长按拖拽排序的flatlist，右边加个固定的按钮，拖拽排序。
 * 考虑到方便实现+节省性能，整个app内的拖拽排序都遵守以下实现。
 * 点击会出现
 */

import {iconSizeConst} from '@/constants/uiConst';
import useTextColor from '@/hooks/useTextColor';
import rpx from '@/utils/rpx';
import React, {
    ForwardedRef,
    forwardRef,
    memo,
    useCallback,
    useEffect,
    useRef,
    useState,
} from 'react';
import {
    LayoutRectangle,
    Pressable,
    StyleSheet,
    View,
    ViewToken,
} from 'react-native';
import {FlatList} from 'react-native-gesture-handler';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

const WINDOW_WIDTH = rpx(750);
const defaultZIndex = 10;

interface ISortableFlatListProps<T> {
    data: T[];
    renderItem: (props: {item: T; index: number}) => JSX.Element;
    // 高度
    itemHeight: number;
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

    const viewableItemsRef = useRef<ViewToken[] | null>(null);

    const layoutRef = useRef<LayoutRectangle>();
    // listref
    const listRef = useRef<FlatList | null>(null);
    // fakeref
    const fakeItemRef = useRef<View | null>(null);
    // contentoffset
    const contentOffsetYRef = useRef<number>(0);

    useEffect(() => {
        _setData([...(data ?? [])]);
    }, [data]);

    const initDragPageY = useRef<number>(0);
    const initDragLocationY = useRef<number>(0);
    const offsetRef = useRef<number>(0);

    //#region 滚动
    const scrollControllerRef = useRef<{
        timer?: any;
        direction: number;
    }>({direction: 0});

    function scrollInterval() {
        if (scrollControllerRef.current.timer) {
            return;
        }
        scrollControllerRef.current.timer = setInterval(() => {
            const scrollController = scrollControllerRef.current;
            if (scrollController.direction === 0) {
                clearScrollInterval();
            } else if (scrollController.direction <= 0) {
                listRef.current?.scrollToIndex?.({
                    index: viewableItemsRef.current
                        ? (viewableItemsRef.current[0]?.index ?? 2) - 2
                        : 0,
                    animated: true,
                    viewOffset: 0,
                });
                if (viewableItemsRef.current?.[0]?.index === 0) {
                    clearScrollInterval();
                }
            } else {
                // todo: 改成offset
                listRef.current?.scrollToIndex?.({
                    index: viewableItemsRef.current
                        ? (viewableItemsRef.current[
                              viewableItemsRef.current.length - 1
                          ]?.index ?? data.length - 3) + 2
                        : 0,
                    animated: true,
                    viewOffset: 1,
                });
                if (
                    viewableItemsRef.current?.[
                        viewableItemsRef?.current.length - 1
                    ]?.index ===
                    data.length - 1
                ) {
                    clearScrollInterval();
                }
            }
        }, 250);
    }

    const clearScrollInterval = useCallback(() => {
        scrollControllerRef.current.timer &&
            clearInterval(scrollControllerRef.current.timer);
        scrollControllerRef.current.timer = null;
    }, []);

    useEffect(() => {
        return () => {
            clearScrollInterval();
        };
    }, []);

    //#endregion

    const onViewRef = useRef((vi: any) => {
        viewableItemsRef.current = vi.viewableItems;
    });
    return (
        <View style={style.flex1}>
            {/* 纯展示 */}
            <FakeFlatListItem
                ref={_ => (fakeItemRef.current = _)}
                backgroundColor={activeBackgroundColor}
                renderItem={renderItem}
                itemHeight={itemHeight}
                item={activeItem}
            />
            <FlatList
                scrollEnabled={scrollEnabled}
                onViewableItemsChanged={onViewRef.current}
                style={style.flex1}
                ref={_ => {
                    listRef.current = _;
                }}
                onLayout={evt => {
                    layoutRef.current = evt.nativeEvent.layout;
                }}
                data={_data}
                getItemLayout={(_, index) => ({
                    length: itemHeight,
                    offset: itemHeight * index,
                    index,
                })}
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
                            if (viewableItemsRef.current) {
                            }
                            scrollControllerRef.current.direction = -1;
                            scrollInterval();
                        } else if (
                            offsetRef.current >
                            (layoutRef.current?.height ?? 0) - 3 * itemHeight
                        ) {
                            // 下滑
                            scrollControllerRef.current.direction = 1;
                            scrollInterval();
                        } else {
                            // 取消timer
                            clearScrollInterval();
                        }
                    }
                }}
                onTouchEnd={e => {
                    clearScrollInterval();
                    if (activeRef.current !== -1) {
                        // 计算最终的位置，触发onSortEnd
                        let index = activeRef.current;
                        if (contentOffsetYRef.current) {
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
                    activeRef.current = -1;
                    setScrollEnabled(true);
                    setActiveItem(null);
                    fakeItemRef.current!.setNativeProps({
                        top: 0,
                        opacity: 0,
                        zIndex: -1,
                    });
                    contentOffsetYRef.current = 0;
                }}
                onTouchCancel={() => {
                    activeRef.current = -1;
                    setScrollEnabled(true);
                    setActiveItem(null);
                    fakeItemRef.current!.setNativeProps({
                        top: 0,
                        opacity: 0,
                        zIndex: -1,
                    });
                    contentOffsetYRef.current = 0;
                }}
                onScroll={e => {
                    contentOffsetYRef.current = e.nativeEvent.contentOffset.y;
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
        item,
        index,
        activeRef,
    } = props;

    // 省一点性能，height是顺着传下来的，放ref就好了
    const styleRef = useRef(
        StyleSheet.create({
            viewWrapper: {
                height: itemHeight,
                width: WINDOW_WIDTH,
                flexDirection: 'row',
                justifyContent: 'flex-end',
                zIndex: defaultZIndex,
            },
            btn: {
                height: itemHeight,
                paddingHorizontal: rpx(28),
                justifyContent: 'center',
                alignItems: 'center',
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
                    name="menu"
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
        'itemHeight' | 'renderItem' | 'item'
    > & {
        backgroundColor?: string;
    },
    ref: ForwardedRef<View>,
) {
    const {itemHeight, renderItem, item, backgroundColor} = props;

    const styleRef = useRef(
        StyleSheet.create({
            viewWrapper: {
                height: itemHeight,
                width: WINDOW_WIDTH,
                flexDirection: 'row',
                justifyContent: 'flex-end',
                zIndex: defaultZIndex,
            },
            btn: {
                height: itemHeight,
                paddingHorizontal: rpx(28),
                justifyContent: 'center',
                alignItems: 'center',
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
            {item ? renderItem({item, index: -1}) : <></>}
            <Pressable style={styleRef.current.btn}>
                <Icon
                    name="menu"
                    size={iconSizeConst.normal}
                    color={textColor}
                />
            </Pressable>
        </View>
    );
});

const style = StyleSheet.create({
    flex1: {
        flex: 1,
        width: WINDOW_WIDTH,
    },
    activeItemDefault: {
        opacity: 0,
        zIndex: -1,
        position: 'absolute',
        top: 0,
        left: 0,
    },
});
