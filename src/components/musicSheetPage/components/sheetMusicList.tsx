import React from 'react';
import {View} from 'react-native';

import Loading from '@/components/base/loading';
import Header from './header';
import MusicList from '@/components/musicList';
import Config from '@/core/config';
import globalStyle from '@/constants/globalStyle';
import HorizontalSafeAreaView from '@/components/base/horizontalSafeAreaView.tsx';
import TrackPlayer from '@/core/trackPlayer';

interface IMusicListProps {
    sheetInfo: IMusic.IMusicSheetItem | null;
    musicList?: IMusic.IMusicItem[] | null;
    onEndReached?: () => void;
    loadMore?: 'loading' | 'done' | 'idle';
    // 是否可收藏
    canStar?: boolean;
}
export default function SheetMusicList(props: IMusicListProps) {
    const {sheetInfo, musicList, onEndReached, loadMore, canStar} = props;

    return (
        <View style={globalStyle.fwflex1}>
            {!musicList ? (
                <Loading />
            ) : (
                <HorizontalSafeAreaView style={globalStyle.fwflex1}>
                    <MusicList
                        showIndex
                        loadMore={loadMore}
                        Header={
                            <Header
                                canStar={canStar}
                                musicSheet={sheetInfo}
                                musicList={musicList}
                            />
                        }
                        musicList={musicList}
                        onItemPress={(musicItem, musicList) => {
                            if (
                                Config.get(
                                    'setting.basic.clickMusicInAlbum',
                                ) === '播放单曲'
                            ) {
                                TrackPlayer.play(musicItem);
                            } else {
                                TrackPlayer.playWithReplacePlayList(
                                    musicItem,
                                    musicList ?? [musicItem],
                                );
                            }
                        }}
                        onEndReached={() => {
                            onEndReached?.();
                        }}
                    />
                </HorizontalSafeAreaView>
            )}
        </View>
    );
}
