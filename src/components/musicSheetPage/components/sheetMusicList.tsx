import React from 'react';
import {StyleSheet, View} from 'react-native';
import rpx from '@/utils/rpx';

import Loading from '@/components/base/loading';
import Header from './header';
import MusicList from '@/components/musicList';
import Config from '@/core/config';
import MusicQueue from '@/core/musicQueue';

interface IMusicListProps {
    sheetInfo: IMusic.IMusicSheetItemBase | null;
    musicList?: IMusic.IMusicItem[] | null;
    onEndReached?: () => void;
    loadMore?: 'loading' | 'done' | 'none';
}
export default function SheetMusicList(props: IMusicListProps) {
    const {sheetInfo: topListDetail, musicList, onEndReached, loadMore} = props;

    return (
        <View style={style.wrapper}>
            {!musicList ? (
                <Loading />
            ) : (
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
                            Config.get('setting.basic.clickMusicInAlbum') ===
                            '播放单曲'
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
            )}
        </View>
    );
}

const style = StyleSheet.create({
    wrapper: {
        width: rpx(750),
        flex: 1,
    },
    topBtn: {
        width: rpx(750),
        height: rpx(80),
    },
});
