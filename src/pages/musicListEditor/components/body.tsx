import React, {useMemo} from 'react';
import {StyleSheet, View} from 'react-native';
import rpx from '@/utils/rpx';
import Button from '@/components/base/button';
import {useAtom} from 'jotai';
import {editingMusicListAtom, musicListChangedAtom} from '../store/atom';
import MusicSheet from '@/core/musicSheet';
import Toast from '@/utils/toast';
import MusicList from './musicList';
import {useParams} from '@/entry/router';

export default function Body() {
    const {musicSheet} = useParams<'music-list-editor'>();
    const [editingMusicList, setEditingMusicList] =
        useAtom(editingMusicListAtom);
    const [musicListChanged, setMusicListChanged] =
        useAtom(musicListChangedAtom);
    const selectedItems = useMemo(
        () => () => editingMusicList.filter(_ => _.checked),
        [editingMusicList],
    );
    return (
        <>
            <View style={style.header}>
                <Button
                    onPress={() => {
                        if (
                            selectedItems().length !==
                                editingMusicList.length &&
                            editingMusicList.length
                        ) {
                            setEditingMusicList(
                                editingMusicList.map(_ => ({
                                    musicItem: _.musicItem,
                                    checked: true,
                                })),
                            );
                        } else {
                            setEditingMusicList(
                                editingMusicList.map(_ => ({
                                    musicItem: _.musicItem,
                                    checked: false,
                                })),
                            );
                        }
                    }}>
                    {`${
                        selectedItems().length !== editingMusicList.length &&
                        editingMusicList.length
                            ? '全选'
                            : '全不选'
                    } (已选${selectedItems().length}首)`}
                </Button>
                <Button
                    fontColor={
                        musicListChanged && musicSheet?.id
                            ? 'normal'
                            : 'secondary'
                    }
                    onPress={async () => {
                        if (musicListChanged && musicSheet?.id) {
                            await MusicSheet.updateAndSaveSheet(musicSheet.id, {
                                musicList: editingMusicList.map(
                                    _ => _.musicItem,
                                ),
                            });
                            Toast.success('保存成功');
                            setMusicListChanged(false);
                        }
                    }}>
                    保存
                </Button>
            </View>
            <MusicList />
        </>
    );
}

const style = StyleSheet.create({
    header: {
        flexDirection: 'row',
        height: rpx(88),
        paddingHorizontal: rpx(24),
        alignItems: 'center',
        justifyContent: 'space-between',
    },
});
