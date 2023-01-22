import React from 'react';

import {ROUTE_PATH, useNavigate} from '@/entry/router';
import ComplexAppBar from '@/components/base/ComplexAppBar';

interface INavBarProps {
    navTitle: string;
    musicList: IMusic.IMusicItem[] | null;
}

export default function (props: INavBarProps) {
    const navigate = useNavigate();
    const {navTitle, musicList = []} = props;

    return (
        <ComplexAppBar
            title={navTitle}
            onSearchPress={() => {
                navigate(ROUTE_PATH.SEARCH_MUSIC_LIST, {
                    musicList: musicList,
                });
            }}
            menuOptions={[
                {
                    icon: 'playlist-edit',
                    title: '批量编辑',
                    onPress() {
                        navigate(ROUTE_PATH.MUSIC_LIST_EDITOR, {
                            musicList: musicList,
                            musicSheet: {
                                title: navTitle,
                            },
                        });
                    },
                },
            ]}
        />
    );
}
