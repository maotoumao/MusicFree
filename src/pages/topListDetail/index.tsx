import React from 'react';
import {StyleSheet} from 'react-native';
import rpx from '@/utils/rpx';
import NavBar from './components/navBar';
import MusicBar from '@/components/musicBar';
import TopListMusicList from './components/albumMusicList';
import useTopListDetail from './hooks/useTopListDetail';
import StatusBar from '@/components/base/statusBar';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useParams} from '@/entry/router';

export default function TopListDetail() {
    const {pluginHash, topList} = useParams<'top-list-detail'>();
    const topListDetail = useTopListDetail(topList, pluginHash);

    return (
        <SafeAreaView style={style.wrapper}>
            <StatusBar />
            <NavBar musicList={topListDetail?.musicList ?? []} />
            <TopListMusicList
                topListDetail={topListDetail}
                musicList={topListDetail?.musicList}
            />
            <MusicBar />
        </SafeAreaView>
    );
}

const style = StyleSheet.create({
    wrapper: {
        width: rpx(750),
        flex: 1,
    },
});
