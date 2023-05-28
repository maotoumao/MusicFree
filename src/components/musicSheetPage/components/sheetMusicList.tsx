import React from 'react';
import {View} from 'react-native';

import Loading from '@/components/base/loading';
import Header from './header';
import MusicList from '@/components/musicList';
import Config from '@/core/config';
import MusicQueue from '@/core/musicQueue';
import globalStyle from '@/constants/globalStyle';
import HorizonalSafeAreaView from '@/components/base/horizonalSafeAreaView';

interface IMusicListProps {
    sheetInfo: IMusic.IMusicSheetItemBase | null;
    musicList?: IMusic.IMusicItem[] | null;
    onEndReached?: () => void;
    loadMore?: 'loading' | 'done' | 'idle';
}
export default function SheetMusicList(props: IMusicListProps) {
    const {sheetInfo: topListDetail, musicList, onEndReached, loadMore} = props;

    return (
        <View style={globalStyle.fwflex1}>
            {!musicList ? (
                <Loading />
            ) : (
                <HorizonalSafeAreaView style={globalStyle.fwflex1}>
                    <MusicList
                        showIndex
                        loadMore={loadMore}
                        Header={
                            <Header
                                topListDetail={topListDetail}
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
                                MusicQueue.play(musicItem);
                            } else {
                                MusicQueue.playWithReplaceQueue(
                                    musicItem,
                                    musicList ?? [musicItem],
                                );
                            }
                        }}
                        onEndReached={() => {
                            onEndReached?.();
                        }}
                    />
                </HorizonalSafeAreaView>
            )}
        </View>
    );
}
