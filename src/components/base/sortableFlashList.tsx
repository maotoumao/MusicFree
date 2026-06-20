import globalStyle from "@/constants/globalStyle";
import { CellContainer, FlashList } from "@shopify/flash-list";
import { useCallback, useEffect, useRef, useState } from "react";
import { LayoutChangeEvent, LayoutRectangle, NativeScrollEvent, NativeSyntheticEvent, StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import { Gesture, GestureDetector, GestureUpdateEvent, PanGestureHandlerEventPayload, Pressable, ScrollView } from "react-native-gesture-handler";
import Animated, { runOnJS, useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import Icon from "./icon";
import { iconSizeConst } from "@/constants/uiConst";
import useTextColor from "@/hooks/useTextColor";
import rpx from "@/utils/rpx";


const AUTO_SCROLL_THRESHOLD_RATIO = 0.2;
const AUTO_SCROLL_MAX_SPEED = 25;

/** 列表项容器 */
interface ISortableFlashListItemProps {
    index: number;
    startDrag?: (index: number) => void;
    children: React.ReactNode;
    style?: StyleProp<ViewStyle>
}

function SortableFlashListItem(props: ISortableFlashListItemProps) {
    const { index, children, startDrag, style } = props;

    const textColor = useTextColor();


    return <Animated.View style={[listItemContainerStyle.container, style]}>
        {children}
        <Pressable style={listItemContainerStyle.dragHandle} onTouchStart={() => {
            startDrag?.(index);
        }}>
            <Icon name="bars-3" size={iconSizeConst.normal} color={textColor}/>
        </Pressable>
    </Animated.View>;
}

const listItemContainerStyle = StyleSheet.create({
    container: {
        flexDirection: "row",
        alignItems: "center",
    },
    dragHandle: {
        position: "absolute",
        right: rpx(12),
        height: "100%",
        justifyContent: "center",
        paddingHorizontal: rpx(16),
        zIndex: 20,
    },
});


interface ISortableFlashListProps<T> {
    // 列表内部的数据
    data: T[];
    // 渲染每一行的函数
    renderItem: (props: { item: T; index: number }) => JSX.Element;
    // 排序结束时的回调函数
    onSortEnd?: (newData: T[]) => void;
    // 列表高度
    estimatedItemSize?: number;
    // 高亮元素样式
    activeBackgroundColor?: string;

}

// 高度应该固定，否则会有问题
export default function SortableFlashList<T extends any = any>(
    props: ISortableFlashListProps<T>
) {
    const { data, renderItem, onSortEnd, estimatedItemSize, activeBackgroundColor } = props;

    const draggingIndexRef = useRef<number>(-1);
    const [dragging, setDragging] = useState(false);


    // 列表layout
    const [listLayout, setListLayout] = useState<LayoutRectangle | null>(null);
    const listLayoutReadyRef = useRef(false);

    // 选中元素位置
    const itemHeightValue = useSharedValue(estimatedItemSize || 0);
    const draggingElementOffsetValue = useSharedValue(-9999);

    // 自动滚动
    const listRef = useRef<FlashList<T>>(null);
    const scrollTimerRef = useRef<NodeJS.Timeout>();

    // 滚动位置
    const listOffsetRef = useRef(0);
    const listHeightRef = useRef(data.length * (estimatedItemSize || 0));


    const scrollHandler = useCallback((evt: NativeSyntheticEvent<NativeScrollEvent>) => {
        listOffsetRef.current = evt.nativeEvent.contentOffset.y;
    }, []);

    const contentSizeChangeHandler = useCallback((_: number, height: number) => {
        listHeightRef.current = height;
    }, []);

    useEffect(() => {
        if (dragging && listLayout) {
            // 根据当前位置判断是否需要滚动
            // 45 fps
            scrollTimerRef.current = setInterval(() => {
                const offsetY = draggingElementOffsetValue.value;
                const scrollView = listRef.current;
                if (!scrollView) return;

                // 高亮元素还没出现，直接返回
                if (draggingElementOffsetValue.value < 0) return;

                // 判断方向 -1: 上滚 1: 下滚  0: 不滚动
                let direction = 0;
                const threshold = listLayout.height * AUTO_SCROLL_THRESHOLD_RATIO;
                let speedFactor = 1;

                if (offsetY < threshold) {
                    direction = -1;
                    speedFactor = (threshold - offsetY) / threshold;
                } else if ((offsetY + itemHeightValue.value) > (listLayout.height - threshold)) {
                    direction = 1;
                    speedFactor = (offsetY + itemHeightValue.value - (listLayout.height - threshold)) / threshold;
                }
                speedFactor = Math.min(speedFactor, 1);


                if (direction === 0) {
                    return;
                }

                if (direction === -1) {
                    // 上滚
                    // 如果已经在顶上
                    if (listOffsetRef.current <= 0) {
                        return;
                    }
                    listRef.current?.scrollToOffset({
                        animated: false,
                        offset: -AUTO_SCROLL_MAX_SPEED * speedFactor + listOffsetRef.current,
                    });
                } else {
                    // 下滚
                    // 如果已经在底部
                    if (listOffsetRef.current + listLayout.height >= listHeightRef.current) {
                        return;
                    }
                    listRef.current?.scrollToOffset({
                        animated: false,
                        offset: AUTO_SCROLL_MAX_SPEED * speedFactor + listOffsetRef.current,
                    });
                }
                
            }, 22);
        }
        return () => {
            if (scrollTimerRef.current) {
                clearInterval(scrollTimerRef.current);
                scrollTimerRef.current = undefined;
            }
            
        };
    }, [dragging, listLayout]);


    const renderCellContainer = useCallback((wrapperProps) => {
        return <CellContainer {...wrapperProps} onLayout={(layoutEvent: LayoutChangeEvent) => {
            const layout = layoutEvent.nativeEvent.layout;
            itemHeightValue.value = layout.height;
            wrapperProps.onLayout?.(layoutEvent);
        }}>
            <SortableFlashListItem index={wrapperProps.index} startDrag={(index) => {
                draggingElementOffsetValue.value = -9999;
                if (listLayoutReadyRef.current) {
                    draggingIndexRef.current = index;
                    setDragging(true);
                }
            }}>
                {wrapperProps.children}
            </SortableFlashListItem>
        </CellContainer>;
    }, []);

    ;

    const onUpdate = (evt: GestureUpdateEvent<PanGestureHandlerEventPayload>) => {
        // 移动高亮元素位置
        if (draggingIndexRef.current !== -1) {
            draggingElementOffsetValue.value = Math.min(Math.max(evt.y - itemHeightValue.value / 2, 0), (listLayout!.height - itemHeightValue.value));
        }  

    };

    const onEnd = () => {
        if (draggingIndexRef.current !== -1) {
            // 计算最终位置
            const fromIndex = draggingIndexRef.current;
            const offsetY = listOffsetRef.current + draggingElementOffsetValue.value + itemHeightValue.value / 2;
            const toIndex = Math.min(Math.max(Math.floor(offsetY / itemHeightValue.value), 0), data.length - 1);

            if (fromIndex === toIndex) {
                // 没有变化 直接返回
                return;
            }
            const cpyData = [...data];
            const newData = cpyData.slice(0, fromIndex).concat(cpyData.slice(fromIndex + 1));
            newData.splice(toIndex, 0, cpyData[fromIndex]);
            onSortEnd?.(newData);
        }
    };

    const onFinalize = () => {
        if (draggingIndexRef.current !== -1) {
            draggingIndexRef.current = -1;
            setDragging(false);
            // 有线程导致的时序问题，延时执行
            setTimeout(() => {
                draggingElementOffsetValue.value = -9999;
            }, 16);
        }
    };

    const gesture = Gesture.Pan().enabled(!!listLayout).shouldCancelWhenOutside(false).onUpdate((evt) => {
        runOnJS(onUpdate)(evt);
    }).onEnd(() => {
        runOnJS(onEnd)();
    }).onFinalize(() => {
        runOnJS(onFinalize)();
        
    });
    

    // styles
    const draggingItemStyle = useAnimatedStyle(() => {
        return {
            top: draggingElementOffsetValue.value,
        };
    });


    return <GestureDetector gesture={gesture}>
        <View style={globalStyle.fwflex1} onLayout={evt => {
            setListLayout(evt.nativeEvent.layout);
            listLayoutReadyRef.current = true;
        }}>
            {dragging && data[draggingIndexRef.current] && <SortableFlashListItem index={-1} style={[listStyles.fakeDraggingItem, {
                backgroundColor: activeBackgroundColor, 
            }, draggingItemStyle]}>
                {renderItem({ item: data[draggingIndexRef.current], index: -1 })}
            </SortableFlashListItem>}
            <FlashList 
                ref={listRef}
                data={data}
                renderItem={renderItem}
                estimatedItemSize={estimatedItemSize}
                CellRendererComponent={renderCellContainer}  
                disableAutoLayout
                scrollEnabled={!dragging}
                scrollEventThrottle={16}
                onScroll={scrollHandler}
                onContentSizeChange={contentSizeChangeHandler}
                renderScrollComponent={ScrollView}
            />
        </View>
    </GestureDetector>;
}


const listStyles = StyleSheet.create({
    fakeDraggingItem: {
        position: "absolute",
        zIndex: 1000,
        top: -9999,
        width: "100%",
    },
});