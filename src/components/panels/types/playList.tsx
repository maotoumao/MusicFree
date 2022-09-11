import React, {useCallback, useEffect, useRef, useState} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import BottomSheet, {
    BottomSheetBackdrop,
    createBottomSheetScrollableComponent,
    SCROLLABLE_TYPE,
} from '@gorhom/bottom-sheet';
import rpx, {vh} from '@/utils/rpx';
import MusicQueue from '@/core/musicQueue';
import {Button, Divider, useTheme} from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

import repeatModeConst from '@/constants/repeatModeConst';
import Tag from '@/components/base/tag';
import {_usePanel} from '../usePanel';
import {fontSizeConst} from '@/constants/uiConst';
import ThemeText from '@/components/base/themeText';
import IconButton from '@/components/base/iconButton';

import {BottomSheetMethods} from '@gorhom/bottom-sheet/lib/typescript/types';
import {isSameMediaItem} from '@/utils/mediaItem';
import {
    DataProvider,
    LayoutProvider,
    RecyclerListView,
    RecyclerListViewProps,
} from 'recyclerlistview';
import Animated from 'react-native-reanimated';

const ITEM_HEIGHT = rpx(108);
const ITEM_WIDTH = rpx(750);
const WRAPPER_HEIGHT = vh(60) - rpx(104);
const INIT_OFFSET = (WRAPPER_HEIGHT - ITEM_HEIGHT) / 2;

// @ts-ignore  解决报错
RecyclerListView.prototype.setNativeProps = function () {
    // todo 参数被传了过去但是貌似没生效。
    // console.log(this);
};
const AnimatedRecyclerListView =
    Animated.createAnimatedComponent(RecyclerListView);
const BottomSheetRecyclerListView = createBottomSheetScrollableComponent<
    any,
    RecyclerListViewProps
>(SCROLLABLE_TYPE.FLATLIST, AnimatedRecyclerListView);

export default function PlayList() {
    const musicQueue = MusicQueue.useMusicQueue();
    const currentMusicItem = MusicQueue.useCurrentMusicItem();
    const repeatMode = MusicQueue.useRepeatMode();
    const sheetRef = useRef<BottomSheetMethods | null>();

    const {unmountPanel} = _usePanel(sheetRef);
    const {colors} = useTheme();
    const [currentIndex, setCurrentIndex] = useState<number>(-1);
    const [dataProvider, setDataProvider] = useState(
        new DataProvider((item1, item2) => item1 !== item2).cloneWithRows(
            musicQueue ?? [],
        ),
    );
    const layoutProvider = new LayoutProvider(
        () => 1,
        (type, dim) => {
            dim.height = ITEM_HEIGHT;
            dim.width = ITEM_WIDTH;
        },
    );
    layoutProvider.shouldRefreshWithAnchoring = false;

    useEffect(() => {
        setCurrentIndex(
            musicQueue.findIndex(_ => isSameMediaItem(currentMusicItem, _)),
        );
    }, [musicQueue, currentMusicItem]);

    useEffect(() => {
        const newDataProvider = dataProvider.cloneWithRows(musicQueue);
        setDataProvider(newDataProvider);
    }, [musicQueue]);

    const rowRenderer = useCallback(
        (type: string | number, item: IMusic.IMusicItem, index: number) => (
            <Pressable
                onPress={() => {
                    MusicQueue.play(item);
                }}
                style={style.musicItem}>
                {currentIndex === index && (
                    <Icon
                        name="music"
                        color={colors.textHighlight}
                        size={fontSizeConst.content}
                        style={style.currentPlaying}
                    />
                )}
                <ThemeText
                    style={[
                        style.musicItemTitle,
                        {
                            color:
                                index === currentIndex
                                    ? colors.textHighlight
                                    : colors.text,
                        },
                    ]}
                    ellipsizeMode="tail"
                    numberOfLines={1}>
                    {item.title}
                    <Text style={{fontSize: fontSizeConst.description}}>
                        {' '}
                        - {item.artist}
                    </Text>
                </ThemeText>
                <Tag tagName={item.platform} />
                <IconButton
                    style={{marginLeft: rpx(14)}}
                    name="close"
                    size="small"
                    onPress={() => {
                        MusicQueue.remove(item);
                    }}
                />
            </Pressable>
        ),
        [currentIndex],
    );

    return (
        <BottomSheet
            ref={_ => (sheetRef.current = _)}
            backdropComponent={props => {
                return (
                    <BottomSheetBackdrop
                        disappearsOnIndex={-1}
                        pressBehavior={'close'}
                        opacity={0.5}
                        {...props}
                    />
                );
            }}
            backgroundStyle={{backgroundColor: colors.primary}}
            handleComponent={null}
            snapPoints={[vh(60)]}
            enablePanDownToClose
            enableOverDrag={false}
            onClose={unmountPanel}>
            <View style={style.wrapper}>
                <ThemeText
                    style={style.headerText}
                    fontSize="title"
                    fontWeight="bold">
                    播放列表
                    <ThemeText fontColor="secondary">
                        {' '}
                        ({musicQueue.length}首)
                    </ThemeText>
                </ThemeText>
                <Button
                    color={colors.text}
                    onPress={() => {
                        MusicQueue.toggleRepeatMode();
                    }}
                    icon={repeatModeConst[repeatMode].icon}>
                    {repeatModeConst[repeatMode].text}
                </Button>
            </View>
            <Divider />
            <View style={style.playListWrapper}>
                <BottomSheetRecyclerListView
                    initialOffset={
                        musicQueue.findIndex(_ =>
                            isSameMediaItem(_, currentMusicItem),
                        ) *
                            ITEM_HEIGHT -
                        INIT_OFFSET
                    }
                    scrollViewProps={{}}
                    canChangeSize={false}
                    style={style.playList}
                    dataProvider={dataProvider}
                    layoutProvider={layoutProvider}
                    // windowcorrection
                    rowRenderer={rowRenderer}
                />
            </View>
        </BottomSheet>
    );
}

const style = StyleSheet.create({
    wrapper: {
        width: rpx(750),
        height: rpx(80),
        paddingHorizontal: rpx(24),
        marginTop: rpx(24),
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    headerText: {
        flex: 1,
    },
    playListWrapper: {
        minHeight: WRAPPER_HEIGHT,
        minWidth: rpx(750),
        width: rpx(750),
        height: WRAPPER_HEIGHT,
        flex: 1,
    },
    playList: {
        width: rpx(750),
        height: WRAPPER_HEIGHT,
        flex: 1,
    },
    currentPlaying: {
        marginRight: rpx(6),
    },
    musicItem: {
        width: ITEM_WIDTH,
        height: ITEM_HEIGHT,
        paddingHorizontal: rpx(24),
        flexDirection: 'row',
        alignItems: 'center',
    },
    musicItemTitle: {
        flex: 1,
    },
});
