import React, {useEffect} from 'react';
import ComplexAppBar from '@/components/base/ComplexAppBar';
import StatusBar from '@/components/base/statusBar';
import Bottom from './components/bottom';
import Body from './components/body';
import {useSetAtom} from 'jotai';
import {editingMusicListAtom, musicListChangedAtom} from './store/atom';
import {useParams} from '@/entry/router';
import globalStyle from '@/constants/globalStyle';
import VerticalSafeAreaView from '@/components/base/verticalSafeAreaView';

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
        <VerticalSafeAreaView style={globalStyle.fwflex1}>
            <StatusBar />
            <ComplexAppBar title={musicSheet?.title ?? '歌单'} />
            <Body />
            <Bottom />
        </VerticalSafeAreaView>
    );
}
