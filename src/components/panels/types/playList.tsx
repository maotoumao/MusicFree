import React, {useCallback, useEffect, useRef, useState} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import BottomSheet, {
    BottomSheetBackdrop,
    BottomSheetFlatList,
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

const ITEM_HEIGHT = rpx(108);
const ITEM_WIDTH = rpx(750);
const WRAPPER_HEIGHT = vh(60) - rpx(104);

export default function PlayList() {
    const musicQueue = MusicQueue.useMusicQueue();
    const currentMusicItem = MusicQueue.useCurrentMusicItem();
    const repeatMode = MusicQueue.useRepeatMode();
    const sheetRef = useRef<BottomSheetMethods | null>();
    const listRef = useRef<any>();
    const [mount, setMount] = useState(false);

    const {unmountPanel} = _usePanel(sheetRef);
    const {colors} = useTheme();
    const [currentIndex, setCurrentIndex] = useState<number>(-1);

    useEffect(() => {
        setMount(true);
    }, []);

    useEffect(() => {
        setCurrentIndex(
            musicQueue.findIndex(_ => isSameMediaItem(currentMusicItem, _)),
        );
    }, [musicQueue, currentMusicItem]);

    const renderItem = useCallback(
        ({item, index}: {item: IMusic.IMusicItem; index: number}) => (
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
                <Button
                    color={colors.text}
                    onPress={() => {
                        MusicQueue.clear();
                    }}
                    icon={'trash-can-outline'}>
                    清空
                </Button>
            </View>
            <Divider />
            {mount && (
                <View style={style.playListWrapper}>
                    <BottomSheetFlatList
                        ref={_ => (listRef.current = _)}
                        extraData={{currentIndex}}
                        initialScrollIndex={Math.max(
                            musicQueue.findIndex(_ =>
                                isSameMediaItem(currentMusicItem, _),
                            ) - 3,
                            0,
                        )}
                        data={musicQueue}
                        renderItem={renderItem}
                        getItemLayout={(_, index) => ({
                            length: ITEM_HEIGHT,
                            offset: ITEM_HEIGHT * index,
                            index,
                        })}
                    />
                </View>
            )}
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
