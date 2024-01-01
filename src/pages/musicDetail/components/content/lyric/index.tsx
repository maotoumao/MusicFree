import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {LayoutRectangle, StyleSheet, Text, View} from 'react-native';
import rpx from '@/utils/rpx';
import useDelayFalsy from '@/hooks/useDelayFalsy';
import {FlatList, TapGestureHandler} from 'react-native-gesture-handler';
import {fontSizeConst} from '@/constants/uiConst';
import {IconButtonWithGesture} from '@/components/base/iconButton';
import Loading from '@/components/base/loading';
import globalStyle from '@/constants/globalStyle';
import {showPanel} from '@/components/panels/usePanel';
import LyricManager from '@/core/lyricManager';
import TrackPlayer from '@/core/trackPlayer';
import {musicIsPaused} from '@/utils/trackUtils';
import delay from '@/utils/delay';
import DraggingTime from './draggingTime';
import LyricItemComponent from './lyricItem';

const ITEM_HEIGHT = rpx(92);

interface IItemHeights {
    blankHeight?: number;
    [k: number]: number;
}

export default function Lyric() {
    const {loading, meta, lyrics: lyric} = LyricManager.useLyricState();
    const currentLrcItem = LyricManager.useCurrentLyric();

    // 是否展示拖拽
    const dragShownRef = useRef(false);
    const [draggingIndex, setDraggingIndex, setDraggingIndexImmi] =
        useDelayFalsy<number | undefined>(undefined, 2000);
    const listRef = useRef<FlatList<ILyric.IParsedLrcItem> | null>();
    const musicState = TrackPlayer.useMusicState();

    const [layout, setLayout] = useState<LayoutRectangle>();

    // 用来缓存高度
    const itemHeightsRef = useRef<IItemHeights>({});

    // 设置空白组件，获取组件高度
    const blankComponent = useMemo(() => {
        return (
            <View
                style={style.empty}
                onLayout={evt => {
                    itemHeightsRef.current.blankHeight =
                        evt.nativeEvent.layout.height;
                }}
            />
        );
    }, []);

    const handleLyricItemLayout = useCallback(
        (index: number, height: number) => {
            itemHeightsRef.current[index] = height;
        },
        [],
    );

    useEffect(() => {
        // 暂停且拖拽才返回
        if (
            lyric.length === 0 ||
            draggingIndex !== undefined ||
            (draggingIndex === undefined && musicIsPaused(musicState)) ||
            lyric[lyric.length - 1].time < 1
        ) {
            return;
        }
        if (currentLrcItem?.index === -1 || !currentLrcItem) {
            listRef.current?.scrollToIndex({
                index: 0,
                viewPosition: 0.5,
            });
        } else {
            listRef.current?.scrollToIndex({
                index: Math.min(currentLrcItem.index ?? 0, lyric.length - 1),
                viewPosition: 0.5,
            });
        }
        // 音乐暂停状态不应该影响到滑动，所以不放在依赖里，但是这样写不好。。
    }, [currentLrcItem, lyric, draggingIndex]);

    // 开始滚动时拖拽生效
    const onScrollBeginDrag = () => {
        dragShownRef.current = true;
    };

    const onScrollEndDrag = async () => {
        if (draggingIndex !== undefined) {
            setDraggingIndex(undefined);
        }
        dragShownRef.current = false;
    };

    const onScroll = (e: any) => {
        if (dragShownRef.current) {
            const offset =
                e.nativeEvent.contentOffset.y +
                e.nativeEvent.layoutMeasurement.height / 2;

            const itemHeights = itemHeightsRef.current;
            let height = itemHeights.blankHeight!;
            if (offset <= height) {
                setDraggingIndex(0);
                return;
            }
            for (let i = 0; i < lyric.length; ++i) {
                height += itemHeights[i] ?? 0;
                if (height > offset) {
                    setDraggingIndex(i);
                    return;
                }
            }
        }
    };

    const onLyricSeekPress = async () => {
        if (draggingIndex !== undefined) {
            const time = lyric[draggingIndex].time + +(meta?.offset ?? 0);
            if (time !== undefined && !isNaN(time)) {
                await TrackPlayer.seekTo(time);
                await TrackPlayer.play();
                setDraggingIndexImmi(undefined);
            }
        }
    };

    console.log(draggingIndex, 'DD');

    return (
        <View style={globalStyle.fwflex1}>
            {loading ? (
                <Loading color="white" />
            ) : lyric?.length ? (
                <FlatList
                    ref={_ => {
                        listRef.current = _;
                    }}
                    onLayout={e => {
                        setLayout(e.nativeEvent.layout);
                    }}
                    viewabilityConfig={{
                        itemVisiblePercentThreshold: 100,
                    }}
                    onScrollToIndexFailed={({index}) => {
                        delay(120).then(() => {
                            listRef.current?.scrollToIndex({
                                index: Math.min(index ?? 0, lyric.length - 1),
                                viewPosition: 0.5,
                            });
                        });
                    }}
                    fadingEdgeLength={120}
                    ListHeaderComponent={blankComponent}
                    ListFooterComponent={blankComponent}
                    onScrollBeginDrag={onScrollBeginDrag}
                    onMomentumScrollEnd={onScrollEndDrag}
                    onScroll={onScroll}
                    scrollEventThrottle={32}
                    style={style.wrapper}
                    data={lyric}
                    initialNumToRender={30}
                    overScrollMode="never"
                    extraData={currentLrcItem}
                    renderItem={({item, index}) => (
                        <LyricItemComponent
                            index={index}
                            text={item.lrc}
                            onLayout={handleLyricItemLayout}
                            light={draggingIndex === index}
                            highlight={currentLrcItem?.index === index}
                        />
                    )}
                />
            ) : (
                <View style={globalStyle.fullCenter}>
                    <Text style={style.white}>暂无歌词</Text>
                    <TapGestureHandler
                        onActivated={() => {
                            showPanel('SearchLrc', {
                                musicItem: TrackPlayer.getCurrentMusic(),
                            });
                        }}>
                        <Text style={style.searchLyric}>搜索歌词</Text>
                    </TapGestureHandler>
                </View>
            )}
            {draggingIndex !== undefined && (
                <View
                    style={[
                        style.draggingTime,
                        layout?.height
                            ? {
                                  top: (layout.height - ITEM_HEIGHT) / 2,
                              }
                            : null,
                    ]}>
                    <DraggingTime
                        time={
                            (lyric[draggingIndex]?.time ?? 0) +
                            +(meta?.offset ?? 0)
                        }
                    />
                    <View style={style.singleLine} />

                    <IconButtonWithGesture
                        style={style.playIcon}
                        sizeType="small"
                        name="play"
                        onPress={onLyricSeekPress}
                    />
                </View>
            )}
        </View>
    );
}

const style = StyleSheet.create({
    wrapper: {
        width: '100%',
        marginVertical: rpx(48),
        flex: 1,
    },
    empty: {
        paddingTop: '70%',
    },
    white: {
        color: 'white',
    },
    draggingTime: {
        position: 'absolute',
        width: '100%',
        height: ITEM_HEIGHT,
        top: '40%',
        marginTop: rpx(48),
        paddingHorizontal: rpx(18),
        right: 0,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    draggingTimeText: {
        color: '#dddddd',
        fontSize: fontSizeConst.description,
        width: rpx(90),
    },
    singleLine: {
        width: '67%',
        height: 1,
        backgroundColor: '#cccccc',
        opacity: 0.4,
    },
    playIcon: {
        width: rpx(90),
        textAlign: 'right',
        color: 'white',
    },
    searchLyric: {
        width: rpx(180),
        marginTop: rpx(14),
        paddingVertical: rpx(10),
        textAlign: 'center',
        alignSelf: 'center',
        color: '#66eeff',
        textDecorationLine: 'underline',
    },
});
