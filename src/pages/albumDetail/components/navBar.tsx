import React from 'react';
import {useNavigation} from '@react-navigation/native';
import {ROUTE_PATH} from '@/entry/router';
import ComplexAppBar from '@/components/base/ComplexAppBar';

interface INavBarProps {
    musicList: IMusic.IMusicItem[] | null;
}

export default function (props: INavBarProps) {
    const navigation = useNavigation<any>();
    const {musicList = []} = props;

    return (
        <ComplexAppBar
            title="专辑"
            onSearchPress={() => {
                navigation.navigate(ROUTE_PATH.SEARCH_MUSIC_LIST, {
                    musicList: musicList,
                });
            }}
            menuOptions={[
                {
                    icon: 'playlist-edit',
                    title: '批量编辑',
                    onPress() {
                        navigation.navigate(ROUTE_PATH.MUSIC_LIST_EDITOR, {
                            musicList: musicList,
                            musicSheet: {
                                title: '专辑',
                            },
                        });
                    },
                },
            ]}
        />
    );
}
