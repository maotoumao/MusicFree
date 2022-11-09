import React from 'react';
import ComplexAppBar from '@/components/base/ComplexAppBar';
import LocalMusicSheet from '@/core/localMusicSheet';
import {ROUTE_PATH, useNavigate} from '@/entry/router';
import LocalMusicList from './localMusicList';
import MusicBar from '@/components/musicBar';

export default function MainPage() {
    const navigate = useNavigate();
    return (
        <>
            <ComplexAppBar
                title="本地音乐"
                onSearchPress={() => {
                    navigate(ROUTE_PATH.SEARCH_MUSIC_LIST, {
                        musicList: LocalMusicSheet.getMusicList(),
                    });
                }}
                menuOptions={[
                    {
                        icon: 'magnify',
                        title: '扫描本地音乐',
                        async onPress() {
                            navigate(ROUTE_PATH.LOCAL_SCAN);
                        },
                    },
                    {
                        icon: 'playlist-edit',
                        title: '批量编辑',
                        async onPress() {
                            navigate(ROUTE_PATH.MUSIC_LIST_EDITOR, {
                                musicList: LocalMusicSheet.getMusicList(),
                            });
                        },
                    },
                ]}
            />
            <LocalMusicList />
            <MusicBar />
        </>
    );
}
