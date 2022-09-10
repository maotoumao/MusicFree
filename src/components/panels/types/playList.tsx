import React, {useCallback, useEffect, useRef, useState} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import BottomSheet, {
    BottomSheetBackdrop,
    BottomSheetFlatList,
    BottomSheetFlatListMethods,
} from '@gorhom/bottom-sheet';
import rpx from '@/utils/rpx';
import MusicQueue from '@/core/musicQueue';
import {Button, Divider, useTheme} from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

import repeatModeConst from '@/constants/repeatModeConst';
import Tag from '@/components/base/tag';
import {_usePanel} from '../usePanel';
import {fontSizeConst} from '@/constants/uiConst';
import ThemeText from '@/components/base/themeText';
import IconButton from '@/components/base/iconButton';

import {internalSymbolKey} from '@/constants/commonConst';
import {BottomSheetMethods} from '@gorhom/bottom-sheet/lib/typescript/types';
import {isSameMediaItem} from '@/utils/mediaItem';

const ITEM_HEIGHT = rpx(108);
export default function PlayList() {
    const musicQueue = MusicQueue.useMusicQueue();
    const currentMusicItem = MusicQueue.useCurrentMusicItem();
    const repeatMode = MusicQueue.useRepeatMode();
    const sheetRef = useRef<BottomSheetMethods | null>();
    const listRef = useRef<BottomSheetFlatListMethods | null>();
    const {unmountPanel} = _usePanel(sheetRef);
    const {colors} = useTheme();
    const [currentIndex, setCurrentIndex] = useState<number>(-1);

    useEffect(() => {
        setCurrentIndex(
            musicQueue.findIndex(_ => isSameMediaItem(currentMusicItem, _)),
        );
    }, [musicQueue, currentMusicItem]);

    const renderItem = useCallback(
        (_: {item: IMusic.IMusicItem; index: number}) => (
            <Pressable
                onPress={() => {
                    MusicQueue.play(_.item);
                }}
                style={style.musicItem}>
                {currentIndex === _.index && (
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
                                _.index === currentIndex
                                    ? colors.textHighlight
                                    : colors.text,
                        },
                    ]}
                    ellipsizeMode="tail"
                    numberOfLines={1}>
                    {_.item.title}
                    <Text style={{fontSize: fontSizeConst.description}}>
                        {' '}
                        - {_.item.artist}
                    </Text>
                </ThemeText>
                <Tag tagName={_.item.platform} />
                <IconButton
                    style={{marginLeft: rpx(14)}}
                    name="close"
                    size="small"
                    onPress={() => {
                        MusicQueue.remove(_.item);
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
            snapPoints={['60%']}
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
            <BottomSheetFlatList
                style={style.playList}
                ref={_ => {
                    listRef.current = _;
                }}
                data={musicQueue}
                extraData={currentIndex}
                keyExtractor={_ =>
                    _[internalSymbolKey]?.globalKey ?? `${_.id}-${_.platform}`
                }
                getItemLayout={(_, index) => ({
                    length: ITEM_HEIGHT,
                    offset: ITEM_HEIGHT * index,
                    index,
                })}
                renderItem={renderItem}
            />
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
    playList: {
        paddingHorizontal: rpx(24),
    },
    currentPlaying: {
        marginRight: rpx(6),
    },
    musicItem: {
        height: ITEM_HEIGHT,
        flexDirection: 'row',
        alignItems: 'center',
    },
    musicItemTitle: {
        flex: 1,
    },
});
