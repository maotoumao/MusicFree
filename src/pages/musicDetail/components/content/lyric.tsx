import React, {useEffect, useMemo, useRef, useState} from 'react';
import {LayoutRectangle, StyleSheet, Text, View} from 'react-native';
import rpx, {vh} from '@/utils/rpx';
import MusicQueue from '@/core/musicQueue';
import LyricParser from '@/core/lrcParser';
import ThemeText from '@/components/base/themeText';
import useDelayFalsy from '@/hooks/useDelayFalsy';
import {FlatList} from 'react-native-gesture-handler';
import timeformat from '@/utils/timeformat';
import {fontSizeConst} from '@/constants/uiConst';
import {IconButtonWithGesture} from '@/components/base/iconButton';
import musicIsPaused from '@/utils/musicIsPaused';
import {trace} from '@/utils/log';
import Loading from '@/components/base/loading';
import {isSameMediaItem} from '@/utils/mediaItem';
import PluginManager from '@/core/pluginManager';
import globalStyle from '@/constants/globalStyle';

interface ICurrentLyricItem {
    lrc?: ILyric.IParsedLrcItem;
    index: number;
}

function useLyric() {
    const musicItem = MusicQueue.useCurrentMusicItem();
    const musicItemRef = useRef<IMusic.IMusicItem>();
    const progress = MusicQueue.useProgress();
    const lrcManagerRef = useRef<LyricParser>();
    const [loading, setLoading] = useState(true);

    const [lyric, setLyric] = useState<ILyric.IParsedLrc>([]);
    const [meta, setMeta] = useState<Record<string, any>>({});
    const [currentLrcItem, setCurentLrcItem] = useState<ICurrentLyricItem>();

    useEffect(() => {
        if (
            !lrcManagerRef.current ||
            !isSameMediaItem(
                lrcManagerRef.current?.getCurrentMusicItem?.(),
                musicItem,
            )
        ) {
            setLoading(true);
            PluginManager.getByMedia(musicItem)
                ?.methods?.getLyricText(musicItem)
                ?.then(lrc => {
                    setLoading(false);
                    trace(musicItem.title, lrc);
                    if (isSameMediaItem(musicItem, musicItemRef.current)) {
                        if (lrc) {
                            const parser = new LyricParser(lrc, musicItem);
                            setLyric(parser.getLyric());
                            setMeta(parser.getMeta());
                            lrcManagerRef.current = parser;
                        } else {
                            setLyric([]);
                            setMeta({});
                            lrcManagerRef.current = undefined;
                        }
                    }
                })
                ?.catch(_ => {
                    if (isSameMediaItem(musicItem, musicItemRef.current)) {
                        setLyric([]);
                        setMeta({});
                        lrcManagerRef.current = undefined;
                    }
                    setLoading(false);
                });
        }
        musicItemRef.current = musicItem;
    }, [musicItem]);

    useEffect(() => {
        if (lrcManagerRef.current && lyric[lyric.length - 1]?.time > 1) {
            setCurentLrcItem(
                lrcManagerRef.current.getPosition(progress.position),
            );
        }
    }, [progress, lyric]);

    return {lyric, currentLrcItem, meta, loading, progress} as const;
}

const ITEM_HEIGHT = rpx(92);

function Empty(props: {height?: number}) {
    return <View style={[style.empty, {paddingTop: props.height}]} />;
}

export default function Lyric() {
    const {lyric, currentLrcItem, meta, loading, progress} = useLyric();
    const [drag, setDrag] = useState(false);
    const [draggingIndex, setDraggingIndex, setDraggingIndexImmi] =
        useDelayFalsy<number | undefined>(undefined, 2000);
    const listRef = useRef<FlatList<ILyric.IParsedLrcItem> | null>();
    const musicState = MusicQueue.usePlaybackState();

    const [layout, setLayout] = useState<LayoutRectangle>();
    const emptyHeight = useMemo(() => {
        const height = Math.max(layout?.height ?? vh(60), vh(60));
        return height / 2;
    }, [layout]);

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
                viewPosition: 0,
            });
        } else {
            listRef.current?.scrollToIndex({
                index: currentLrcItem.index ?? 0,
                viewPosition: 0,
            });
        }
        // 音乐暂停状态不应该影响到滑动，所以不放在依赖里，但是这样写不好。。
    }, [currentLrcItem, lyric, draggingIndex]);

    const onScrollBeginDrag = () => {
        setDrag(true);
    };

    const onScrollEndDrag = async () => {
        if (draggingIndex !== undefined) {
            setDraggingIndex(undefined);
        }
        setDrag(false);
    };

    const onScroll = (e: any) => {
        if (drag) {
            setDraggingIndex(
                Math.min(
                    Math.floor(e.nativeEvent.contentOffset.y / ITEM_HEIGHT),
                    lyric.length - 1,
                ),
            );
        }
    };

    const onLyricSeekPress = async () => {
        if (draggingIndex !== undefined) {
            const time = lyric[draggingIndex].time + (meta?.offset ?? 0);
            if (time !== undefined && !isNaN(time)) {
                await MusicQueue.seekTo(time);
                await MusicQueue.play();
                setDraggingIndexImmi(undefined);
            }
        }
    };

    return (
        <View style={globalStyle.fwflex1}>
            {loading ? (
                <Loading />
            ) : (
                <FlatList
                    ref={_ => {
                        listRef.current = _;
                    }}
                    getItemLayout={(data, index) => ({
                        length: ITEM_HEIGHT,
                        offset: ITEM_HEIGHT * index,
                        index,
                    })}
                    ListEmptyComponent={
                        <View style={globalStyle.flex1}>
                            <ThemeText style={style.highlightItem}>
                                暂无歌词
                            </ThemeText>
                        </View>
                    }
                    onLayout={e => {
                        setLayout(e.nativeEvent.layout);
                    }}
                    ListHeaderComponent={<Empty height={emptyHeight} />}
                    ListFooterComponent={<Empty height={emptyHeight} />}
                    onStartShouldSetResponder={() => true}
                    onStartShouldSetResponderCapture={() => true}
                    onScrollBeginDrag={onScrollBeginDrag}
                    onScrollEndDrag={onScrollEndDrag}
                    onScroll={onScroll}
                    style={style.wrapper}
                    data={lyric}
                    extraData={currentLrcItem}
                    renderItem={({item, index}) => (
                        <ThemeText
                            style={[
                                index === currentLrcItem?.index
                                    ? style.highlightItem
                                    : style.item,
                                index === draggingIndex
                                    ? style.draggingItem
                                    : undefined,
                            ]}>
                            {item.lrc}
                        </ThemeText>
                    )}
                />
            )}
            {draggingIndex !== undefined && (
                <View
                    style={[
                        style.draggingTime,
                        {
                            top: emptyHeight - ITEM_HEIGHT / 2,
                        },
                    ]}>
                    <Text style={style.draggingTimeText}>
                        {timeformat(
                            Math.min(
                                (lyric[draggingIndex]?.time ?? 0) +
                                    (meta?.offset ?? 0),
                                progress.duration ?? 0,
                            ),
                        )}
                    </Text>
                    <View style={style.singleLine} />

                    <IconButtonWithGesture
                        style={style.playIcon}
                        size="small"
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
    item: {
        fontSize: rpx(28),
        color: '#aaaaaa',
        paddingHorizontal: rpx(64),
        width: '100%',
        height: ITEM_HEIGHT,
        textAlign: 'center',
        textAlignVertical: 'center',
    },
    highlightItem: {
        fontSize: rpx(32),
        color: 'white',
        width: '100%',
        paddingHorizontal: rpx(64),
        height: ITEM_HEIGHT,
        textAlign: 'center',
        textAlignVertical: 'center',
    },
    draggingItem: {
        color: '#dddddd',
    },
    empty: {
        paddingTop: '65%',
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
    },
});
