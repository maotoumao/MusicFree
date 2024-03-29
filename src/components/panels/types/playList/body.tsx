import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import rpx, {vh} from '@/utils/rpx';
import {FlatList} from 'react-native-gesture-handler';
import Tag from '@/components/base/tag';
import ThemeText from '@/components/base/themeText';
import {fontSizeConst} from '@/constants/uiConst';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {isSameMediaItem} from '@/utils/mediaItem';
import IconButton from '@/components/base/iconButton';
import Loading from '@/components/base/loading';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import useColors from '@/hooks/useColors';
import TrackPlayer from '@/core/trackPlayer';

const ITEM_HEIGHT = rpx(108);
const ITEM_WIDTH = rpx(750);
const WRAPPER_HEIGHT = vh(60) - rpx(104);

interface IPlayListProps {
    item: IMusic.IMusicItem;
    index: number;
    currentIndex: number;
}

function _PlayListItem(props: IPlayListProps) {
    const colors = useColors();
    const {item, index, currentIndex} = props;

    // console.log('rerender', index, currentIndex, item);
    return (
        <Pressable
            onPress={() => {
                TrackPlayer.play(item);
            }}
            style={style.musicItem}>
            {currentIndex === index && (
                <Icon
                    name="music"
                    color={colors.textHighlight ?? colors.primary}
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
                                ? colors.textHighlight ?? colors.primary
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
                sizeType="small"
                onPress={() => {
                    TrackPlayer.remove(item);
                }}
            />
        </Pressable>
    );
}

const PlayListItem = React.memo(
    _PlayListItem,
    (prev, next) =>
        !!isSameMediaItem(prev.item, next.item) &&
        prev.index === next.index &&
        ((prev.currentIndex === prev.index &&
            next.currentIndex === next.index) ||
            (prev.currentIndex !== prev.index &&
                next.currentIndex !== next.index)),
);

interface IBodyProps {
    loading?: boolean;
}
export default function Body(props: IBodyProps) {
    const {loading} = props;
    const playList = TrackPlayer.usePlayList();
    const currentMusicItem = TrackPlayer.useCurrentMusic();
    const [currentIndex, setCurrentIndex] = useState<number>(-1);
    const listRef = useRef<FlatList<IMusic.IMusicItem> | null>();
    const safeAreaInsets = useSafeAreaInsets();

    const initIndex = useMemo(() => {
        const id = playList.findIndex(_ =>
            isSameMediaItem(currentMusicItem, _),
        );

        if (id !== -1) {
            return id;
        }
        return undefined;
    }, []);

    useEffect(() => {
        setCurrentIndex(
            playList.findIndex(_ => isSameMediaItem(currentMusicItem, _)),
        );
    }, [playList, currentMusicItem]);

    const renderItem = useCallback(
        ({item, index}: {item: IMusic.IMusicItem; index: number}) => {
            // console.log('recall');
            return (
                <PlayListItem
                    item={item}
                    index={index}
                    currentIndex={currentIndex}
                />
            );
        },
        [currentIndex],
    );

    return loading ? (
        <Loading />
    ) : (
        <View style={style.playList}>
            <FlatList
                ref={_ => {
                    listRef.current = _;
                }}
                style={[
                    style.playListWrapper,
                    {marginBottom: safeAreaInsets.bottom},
                ]}
                getItemLayout={(_, index) => ({
                    length: ITEM_HEIGHT,
                    offset: ITEM_HEIGHT * index,
                    index,
                })}
                data={playList}
                initialScrollIndex={initIndex}
                renderItem={renderItem}
            />
        </View>
    );
}

const style = StyleSheet.create({
    playListWrapper: {
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
