import React from 'react';
import {useNavigation} from '@react-navigation/native';
import ComplexAppBar from '@/components/base/ComplexAppBar';
import MusicSheet from '@/core/musicSheet';
import {ROUTE_PATH, useParams} from '@/entry/router';
import useDialog from '@/components/dialogs/useDialog';
import Toast from '@/utils/toast';

export default function () {
    const navigation = useNavigation<any>();
    const {id = 'favorite'} = useParams<'local-sheet-detail'>();
    const musicSheet = MusicSheet.useSheets(id);
    const {showDialog} = useDialog();

    return (
        <ComplexAppBar
            title="歌单"
            onSearchPress={() => {
                navigation.navigate(ROUTE_PATH.SEARCH_MUSIC_LIST, {
                    musicList: musicSheet?.musicList,
                });
            }}
            menuOptions={[
                {
                    icon: 'trash-can-outline',
                    title: '删除歌单',
                    show: id !== 'favorite',
                    onPress() {
                        showDialog('SimpleDialog', {
                            title: '删除歌单',
                            content: `确定删除歌单「${musicSheet.title}」吗?`,
                            onOk: async () => {
                                await MusicSheet.removeSheet(id);
                                Toast.success('已删除');
                                navigation.goBack();
                            },
                        });
                    },
                },
                {
                    icon: 'playlist-edit',
                    title: '批量编辑',
                    onPress() {
                        navigation.navigate(ROUTE_PATH.MUSIC_LIST_EDITOR, {
                            musicList: musicSheet.musicList,
                            musicSheet: musicSheet,
                        });
                    },
                },
                {
                    icon: 'square-edit-outline',
                    title: '编辑歌单信息',
                    onPress() {
                        showDialog('EditSheetDetailDialog', {
                            musicSheet: musicSheet,
                        });
                    },
                },
                {
                    icon: 'sort',
                    title: '排序',
                    onPress() {
                        showDialog('RadioDialog', {
                            content: [
                                {
                                    value: 'random',
                                    key: '随机顺序',
                                },
                                {
                                    value: 'a2z',
                                    key: '歌曲名A-Z',
                                },
                                {
                                    value: 'z2a',
                                    key: '歌曲名Z-A',
                                },
                                {
                                    value: 'arta2z',
                                    key: '作者名A-Z',
                                },
                                {
                                    value: 'artz2a',
                                    key: '作者名Z-A',
                                },
                            ],
                            title: '排序',
                            async onOk(value) {
                                MusicSheet.sortMusicList(
                                    value as any,
                                    musicSheet,
                                );
                            },
                        });
                    },
                },
            ]}
        />
    );
}
