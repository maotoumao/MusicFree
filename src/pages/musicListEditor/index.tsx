import React, {useEffect} from 'react';
import {StyleSheet} from 'react-native';
import rpx from '@/utils/rpx';
import ComplexAppBar from '@/components/base/ComplexAppBar';
import StatusBar from '@/components/base/statusBar';
import {SafeAreaView} from 'react-native-safe-area-context';
import Bottom from './components/bottom';
import Body from './components/body';
import {useSetAtom} from 'jotai';
import {editingMusicListAtom, musicListChangedAtom} from './store/atom';
import {useParams} from '@/entry/router';

export default function MusicListEditor() {
    const {musicSheet, musicList} = useParams<'music-list-editor'>();

    const setEditingMusicList = useSetAtom(editingMusicListAtom);
    const setMusicListChanged = useSetAtom(musicListChangedAtom);

    useEffect(() => {
        setEditingMusicList(
            (musicList ?? []).map(_ => ({musicItem: _, checked: false})),
        );
        return () => {
            setEditingMusicList([]);
            setMusicListChanged(false);
        };
    }, []);

    return (
        <SafeAreaView style={style.wrapper}>
            <StatusBar />
            <ComplexAppBar title={musicSheet?.title ?? '歌单'} />
            <Body />
            <Bottom />
        </SafeAreaView>
    );
}

const style = StyleSheet.create({
    wrapper: {
        width: rpx(750),
        flex: 1,
    },
});
