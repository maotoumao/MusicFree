import { RequestStateCode } from '@/constants/commonConst';
import TrackPlayer from '@/core/trackPlayer';
import rpx from '@/utils/rpx';
import { FlashList } from '@shopify/flash-list';
import React from 'react';
import { FlatListProps } from 'react-native';
import ListEmpty from '../base/listEmpty';
import ListFooter from '../base/listFooter';
import MusicItem from '../mediaItem/musicItem';

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
    // 状态
    state: RequestStateCode;
    onRetry?: () => void;
    onLoadMore?: () => void;
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
        state,
        onRetry,
        onLoadMore,
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
            ListEmptyComponent={<ListEmpty state={state} onRetry={onRetry}/>}
            ListFooterComponent={
                musicList?.length ? <ListFooter state={state} onRetry={onRetry} /> : null
            }
            data={musicList ?? []}
            // keyExtractor={keyExtractor}
            estimatedItemSize={ITEM_HEIGHT}
            renderItem={({ index, item: musicItem }) => {
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
                if (state === RequestStateCode.IDLE || state === RequestStateCode.PARTLY_DONE) {
                    onLoadMore?.();
                }
            }}
            onEndReachedThreshold={0.1}
        />
    );
}
