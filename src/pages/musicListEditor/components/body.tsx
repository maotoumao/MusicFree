import React, {useMemo} from 'react';
import {StyleSheet, View} from 'react-native';
import rpx from '@/utils/rpx';
import Button from '@/components/base/textButton.tsx';
import {useAtom} from 'jotai';
import {editingMusicListAtom, musicListChangedAtom} from '../store/atom';
import Toast from '@/utils/toast';
import MusicList from './musicList';
import {useParams} from '@/entry/router';
import {localMusicSheetId, musicHistorySheetId} from '@/constants/commonConst';
import LocalMusicSheet from '@/core/localMusicSheet';
import HorizontalSafeAreaView from '@/components/base/horizontalSafeAreaView.tsx';
import globalStyle from '@/constants/globalStyle';
import musicHistory from '@/core/musicHistory';
import MusicSheet from '@/core/musicSheet';

export default function Body() {
    const {musicSheet} = useParams<'music-list-editor'>();
    const [editingMusicList, setEditingMusicList] =
        useAtom(editingMusicListAtom);
    const [musicListChanged, setMusicListChanged] =
        useAtom(musicListChangedAtom);
    const selectedItems = useMemo(
        () => editingMusicList.filter(_ => _.checked),
        [editingMusicList],
    );
    return (
        <HorizontalSafeAreaView style={globalStyle.flex1}>
            <View style={style.header}>
                <Button
                    onPress={() => {
                        if (
                            selectedItems.length !== editingMusicList.length &&
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
                        selectedItems.length !== editingMusicList.length &&
                        editingMusicList.length
                            ? '全选'
                            : '全不选'
                    } (已选${selectedItems.length}首)`}
                </Button>
                <Button
                    fontColor={
                        musicListChanged && musicSheet?.id
                            ? 'primary'
                            : 'textSecondary'
                    }
                    onPress={async () => {
                        if (musicListChanged && musicSheet?.id) {
                            if (musicSheet.id === localMusicSheetId) {
                                await LocalMusicSheet.updateMusicList(
                                    editingMusicList.map(_ => _.musicItem),
                                );
                            } else if (musicSheet.id === musicHistorySheetId) {
                                await musicHistory.setHistory(
                                    editingMusicList.map(_ => _.musicItem),
                                );
                            } else {
                                await MusicSheet.manualSort(
                                    musicSheet.id,
                                    editingMusicList.map(_ => _.musicItem),
                                );
                            }

                            Toast.success('保存成功');
                            setMusicListChanged(false);
                        }
                    }}>
                    保存
                </Button>
            </View>
            <MusicList />
        </HorizontalSafeAreaView>
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
