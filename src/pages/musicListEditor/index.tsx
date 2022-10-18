import React, {useEffect} from 'react';
import {StyleSheet} from 'react-native';
import rpx from '@/utils/rpx';
import ComplexAppBar from '@/components/base/ComplexAppBar';
import StatusBar from '@/components/base/statusBar';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useRoute} from '@react-navigation/native';
import Bottom from './components/bottom';
import Body from './components/body';
import {useSetAtom} from 'jotai';
import {
    editingMusicListAtom,
    musicListChangedAtom,
    selectedIndicesAtom,
} from './store/atom';

// todo 批量编辑
export default function MusicListEditor() {
    const route = useRoute<any>();
    const musicSheet: IMusic.IMusicSheetItem = route.params?.musicSheet ?? null;
    const musicList: IMusic.IMusicItem[] = route.params?.musicList ?? [];

    const setEditingMusicList = useSetAtom(editingMusicListAtom);
    const setSelectedIndices = useSetAtom(selectedIndicesAtom);
    const setMusicListChanged = useSetAtom(musicListChangedAtom);

    useEffect(() => {
        setEditingMusicList(musicList);
        return () => {
            setEditingMusicList([]);
            setSelectedIndices([]);
            setMusicListChanged(false);
        };
    }, []);

    return (
        <SafeAreaView style={style.wrapper}>
            <StatusBar />
            <ComplexAppBar title={musicSheet.title ?? '歌单'} />
            <Body musicSheet={musicSheet} />
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
