import Empty from '@/components/base/empty';
import ListReachEnd from '@/components/base/listReachEnd';
import Loading from '@/components/base/loading';
import LyricItem from '@/components/mediaItem/LyricItem';
import { RequestStateCode } from '@/constants/commonConst';
import lyricManager from '@/core/lyricManager';
import TrackPlayer from '@/core/trackPlayer';
import rpx from '@/utils/rpx';
import Toast from '@/utils/toast';
import React, { memo } from 'react';
import { FlatList } from 'react-native-gesture-handler';
import { hidePanel } from '../../usePanel';
import searchResultStore, { ISearchLyricResult } from './searchResultStore';

interface ILyricListWrapperProps {
    route: {
        key: string;
        title: string;
    };
}
export default function LyricListWrapper(props: ILyricListWrapperProps) {
    const hash = props.route.key;
    const dataStore = searchResultStore.useValue();
    return <LyricList data={dataStore.data[hash]} />;
}

interface ILyricListProps {
    data: ISearchLyricResult;
}

const ITEM_HEIGHT = rpx(120);
function LyricListImpl(props: ILyricListProps) {
    const data = props.data;
    const searchState = data?.state ?? RequestStateCode.IDLE;

    return searchState === RequestStateCode.PENDING_FIRST_PAGE ? (
        <Loading />
    ) : (
        <FlatList
            getItemLayout={(_, index) => ({
                length: ITEM_HEIGHT,
                offset: ITEM_HEIGHT * index,
                index,
            })}
            renderItem={({ item }) => (
                <LyricItem
                    lyricItem={item}
                    onPress={async () => {
                        try {
                            const currentMusic = TrackPlayer.currentMusic;
                            if (!currentMusic) {
                                return;
                            }

                            lyricManager.associateLyric(currentMusic, item);
                            Toast.success('设置成功~');
                            hidePanel();
                            // 触发刷新歌词
                        } catch {
                            Toast.warn('设置失败!');
                        }
                    }}
                />
            )}
            ListEmptyComponent={<Empty />}
            ListFooterComponent={() => (
                // searchState === RequestStateCode.PENDING ? (
                //     <ListLoading />
                // ) : searchState === RequestStateCode.FINISHED ? (
                //     <ListReachEnd />
                // ) : (
                //     <></>
                // )
                <ListReachEnd />
            )}
            data={data?.data}
        />
    );
}

const LyricList = memo(LyricListImpl, (prev, curr) => prev.data === curr.data);
