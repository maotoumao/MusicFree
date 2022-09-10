import React from 'react';
import {useNavigation, useRoute} from '@react-navigation/native';
import AppBarWithSearch from '@/components/base/appBarWithSearch';
import MusicSheet from '@/core/musicSheet';
import {ROUTE_PATH} from '@/entry/router';
import useDialog from '@/components/dialogs/useDialog';
import Toast from '@/utils/toast';

export default function () {
    const navigation = useNavigation<any>();
    const route = useRoute<any>();
    const id = route.params?.id ?? 'favorite';
    const musicSheet = MusicSheet.useSheets(id);
    const {showDialog} = useDialog();

    return (
        <AppBarWithSearch
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
                            content: `确定删除歌单${musicSheet.title}吗?`,
                            onOk: async () => {
                                await MusicSheet.removeSheet(id);
                                Toast.success('已删除');
                                navigation.goBack();
                            },
                        });
                    },
                },
            ]}
        />
    );
}
