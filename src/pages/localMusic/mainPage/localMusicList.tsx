import React from 'react';
import MusicList from '@/components/musicList';
import LocalMusicSheet from '@/core/localMusicSheet';
import {localMusicSheetId} from '@/constants/commonConst';
import HorizonalSafeAreaView from '@/components/base/horizonalSafeAreaView';
import globalStyle from '@/constants/globalStyle';

export default function LocalMusicList() {
    const musicList = LocalMusicSheet.useMusicList();

    return (
        <HorizonalSafeAreaView style={globalStyle.flex1}>
            <MusicList
                musicList={musicList}
                showIndex
                musicSheet={{
                    id: localMusicSheetId,
                    title: '本地',
                    musicList: musicList,
                }}
            />
        </HorizonalSafeAreaView>
    );
}
