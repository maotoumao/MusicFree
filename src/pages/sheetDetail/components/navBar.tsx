import React from 'react';
import {useNavigation} from '@react-navigation/native';
import {ROUTE_PATH, useParams} from '@/entry/router';
import Toast from '@/utils/toast';
import toast from '@/utils/toast';
import {showDialog} from '@/components/dialogs/useDialog';
import AppBar from '@/components/base/appBar';
import MusicSheet from '@/core/musicSheet';
import {SortType} from '@/constants/commonConst.ts';
import {showPanel} from '@/components/panels/usePanel.ts';

export default function () {
    const navigation = useNavigation<any>();
    const {id = 'favorite'} = useParams<'local-sheet-detail'>();
    const musicSheet = MusicSheet.useSheetItem(id);

    return (
        <>
            <AppBar
                menu={[
                    {
                        icon: 'pencil-outline',
                        title: '编辑歌单信息',
                        onPress() {
                            showPanel('EditMusicSheetInfo', {
                                musicSheet: musicSheet,
                            });
                        },
                    },
                    {
                        icon: 'pencil-square',
                        title: '批量编辑歌曲',
                        onPress() {
                            navigation.navigate(ROUTE_PATH.MUSIC_LIST_EDITOR, {
                                musicList: musicSheet.musicList,
                                musicSheet: musicSheet,
                            });
                        },
                    },
                    {
                        icon: 'sort-outline',
                        title: '歌曲排序',
                        onPress() {
                            showDialog('RadioDialog', {
                                content: [
                                    {
                                        value: SortType.Title,
                                        label: '按歌曲名排序',
                                    },
                                    {
                                        value: SortType.Artist,
                                        label: '按作者名排序',
                                    },
                                    {
                                        value: SortType.Album,
                                        label: '按专辑名排序',
                                    },
                                    {
                                        value: SortType.Newest,
                                        label: '按收藏时间从新到旧排序',
                                    },
                                    {
                                        value: SortType.Oldest,
                                        label: '按收藏时间从旧到新排序',
                                    },
                                ],
                                defaultSelected:
                                    MusicSheet.getSheetMeta(id, 'sort') ||
                                    SortType.None,
                                title: '歌曲排序',
                                async onOk(value) {
                                    await MusicSheet.setSortType(
                                        id,
                                        value as SortType,
                                    );
                                    toast.success('排序已更新');
                                },
                            });
                        },
                    },
                    {
                        icon: 'trash-outline',
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
                ]}
                actions={[
                    {
                        icon: 'magnifying-glass',
                        onPress() {
                            navigation.navigate(ROUTE_PATH.SEARCH_MUSIC_LIST, {
                                musicList: musicSheet?.musicList,
                                musicSheet: musicSheet,
                            });
                        },
                    },
                ]}>
                歌单
            </AppBar>
        </>
    );
}
