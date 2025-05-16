import React from 'react';
import VerticalSafeAreaView from '@/components/base/verticalSafeAreaView';
import globalStyle from '@/constants/globalStyle';
import StatusBar from '@/components/base/statusBar';
import musicHistory, { useMusicHistory } from '@/core/musicHistory';
import MusicList from '@/components/musicList';
import { musicHistorySheetId, RequestStateCode } from '@/constants/commonConst';
import MusicBar from '@/components/musicBar';
import AppBar from '@/components/base/appBar';
import { ROUTE_PATH, useNavigate } from '@/core/router';

export default function History() {
    const musicHistoryList = useMusicHistory();

    const navigate = useNavigate();

    return (
        <VerticalSafeAreaView style={globalStyle.fwflex1}>
            <StatusBar />
            <AppBar
                menu={[
                    {
                        icon: 'trash-outline',
                        title: '清空播放记录',
                        onPress() {
                            if (musicHistoryList.length) {
                                musicHistory.clearMusic();
                            }
                        },
                    },
                    {
                        icon: 'pencil-square',
                        title: '编辑',
                        onPress() {
                            navigate(ROUTE_PATH.MUSIC_LIST_EDITOR, {
                                musicList: musicHistoryList,
                                musicSheet: {
                                    id: musicHistorySheetId,
                                    title: '播放记录',
                                },
                            });
                        },
                    },
                ]}>
                播放记录
            </AppBar>
            <MusicList
                musicList={musicHistoryList}
                showIndex
                state={RequestStateCode.IDLE}
                musicSheet={{
                    id: musicHistorySheetId,
                    title: '播放记录',
                    musicList: musicHistoryList,
                } as IMusic.IMusicSheetItem}
            />
            <MusicBar />
        </VerticalSafeAreaView>
    );
}
