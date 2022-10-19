import React, {useMemo} from 'react';
import {StyleSheet, View} from 'react-native';
import rpx from '@/utils/rpx';
import Button from '@/components/base/button';
import {useAtom} from 'jotai';
import {
    editingMusicListAtom,
    musicListChangedAtom,
    selectedIndicesAtom,
} from '../store/atom';
import MusicSheet from '@/core/musicSheet';
import Toast from '@/utils/toast';
import MusicList from './musicList';

interface IBodyProps {
    musicSheet: IMusic.IMusicSheetItem;
}
export default function Body(props: IBodyProps) {
    const {musicSheet} = props;
    const [editingMusicList] = useAtom(editingMusicListAtom);
    const [selectedIndices, setSelectedIndices] = useAtom(selectedIndicesAtom);
    const [musicListChanged, setMusicListChanged] =
        useAtom(musicListChangedAtom);
    const selectedItems = useMemo(
        () => () =>
            editingMusicList.filter((_, index) => selectedIndices[index]),
        [editingMusicList, selectedIndices],
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
                            setSelectedIndices(
                                Array(editingMusicList.length).fill(true),
                            );
                        } else {
                            setSelectedIndices(
                                Array(editingMusicList.length).fill(false),
                            );
                        }
                    }}>
                    {`${
                        selectedItems().length !== editingMusicList.length &&
                        editingMusicList.length
                            ? '全选'
                            : '全不选'
                    } (已选${selectedIndices.filter(_ => _).length}首)`}
                </Button>
                <Button
                    fontColor={
                        musicListChanged && musicSheet.id
                            ? 'normal'
                            : 'secondary'
                    }
                    onPress={async () => {
                        if (musicListChanged && musicSheet.id) {
                            await MusicSheet.updateAndSaveSheet(musicSheet.id, {
                                musicList: editingMusicList,
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
