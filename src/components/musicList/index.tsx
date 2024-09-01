import React from 'react';
import {FlatListProps} from 'react-native';
import rpx from '@/utils/rpx';

import MusicItem from '../mediaItem/musicItem';
import Empty from '../base/empty';
import {FlashList} from '@shopify/flash-list';
import ListLoading from '../base/listLoading';
import ListReachEnd from '../base/listReachEnd';
import TrackPlayer from '@/core/trackPlayer';

interface IMusicListProps {
    /** 顶部 */
    Header?: FlatListProps<IMusic.IMusicItem>['ListHeaderComponent'];
    /** 音乐列表 */
    musicList?: IMusic.IMusicItem[];
    /** 所在歌单 */
    musicSheet?: IMusic.IMusicSheetItem;
    /** 是否展示序号 */
    showIndex?: boolean;
    /** 点击 */
    onItemPress?: (
        musicItem: IMusic.IMusicItem,
        musicList?: IMusic.IMusicItem[],
    ) => void;
    loadMore?: 'loading' | 'done' | 'idle';
    onEndReached?: () => void;
}
const ITEM_HEIGHT = rpx(120);

/** 音乐列表 */
export default function MusicList(props: IMusicListProps) {
    const {
        Header,
        musicList,
        musicSheet,
        showIndex,
        onItemPress,
        onEndReached,
        loadMore = 'idle',
    } = props;

    // ! keyExtractor需要保证整个生命周期统一？ 有些奇怪
    // const keyExtractor = useCallback(
    //     (item: any, index: number) =>
    //         '' + index + '-' + item.platform + '-' + item.id,
    //     [],
    // );

    return (
        <FlashList
            ListHeaderComponent={Header}
            ListEmptyComponent={loadMore !== 'loading' ? Empty : null}
            ListFooterComponent={
                loadMore === 'done'
                    ? ListReachEnd
                    : loadMore === 'loading'
                    ? ListLoading
                    : null
            }
            data={musicList ?? []}
            // keyExtractor={keyExtractor}
            estimatedItemSize={ITEM_HEIGHT}
            renderItem={({index, item: musicItem}) => {
                return (
                    <MusicItem
                        musicItem={musicItem}
                        index={showIndex ? index + 1 : undefined}
                        onItemPress={() => {
                            if (onItemPress) {
                                onItemPress(musicItem, musicList);
                            } else {
                                TrackPlayer.playWithReplacePlayList(
                                    musicItem,
                                    musicList ?? [musicItem],
                                );
                            }
                        }}
                        musicSheet={musicSheet}
                    />
                );
            }}
            onEndReached={() => {
                if (loadMore !== 'loading') {
                    onEndReached?.();
                }
            }}
            onEndReachedThreshold={0.1}
        />
    );
}
