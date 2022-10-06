import React from 'react';
import {StyleSheet} from 'react-native';
import rpx from '@/utils/rpx';
import {useRoute} from '@react-navigation/native';
import NavBar from './components/navBar';
import MusicBar from '@/components/musicBar';
import AlbumMusicList from './components/albumMusicList';
import useAlbumDetail from './hooks/useAlbumMusicList';
import StatusBar from '@/components/base/statusBar';
import {SafeAreaView} from 'react-native-safe-area-context';

export default function AlbumDetail() {
    const route = useRoute<any>();
    const albumItem = route.params?.albumItem ?? null;
    const albumDetail = useAlbumDetail(albumItem);

    return (
        <SafeAreaView style={style.wrapper}>
            <StatusBar />
            <NavBar musicList={albumDetail?.musicList ?? []} />
            <AlbumMusicList
                albumItem={albumDetail}
                musicList={albumDetail?.musicList}
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
