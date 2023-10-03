import React from 'react';
import {StyleSheet, View} from 'react-native';
import rpx from '@/utils/rpx';
import VerticalSafeAreaView from '@/components/base/verticalSafeAreaView';
import globalStyle from '@/constants/globalStyle';
import StatusBar from '@/components/base/statusBar';
import musicHistory from '@/core/musicHistory';
import MusicList from '@/components/musicList';
import {musicHistorySheetId} from '@/constants/commonConst';
import MusicBar from '@/components/musicBar';
import Button from '@/components/base/button';
import AppBar from '@/components/base/appBar';

export default function History() {
    const musicHistoryList = musicHistory.useMusicHistory();
    return (
        <VerticalSafeAreaView style={globalStyle.fwflex1}>
            <StatusBar />
            <AppBar>播放记录</AppBar>
            <View style={style.opeartions}>
                <Button
                    onPress={() => {
                        if (musicHistoryList.length) {
                            musicHistory.clearMusic();
                        }
                    }}>
                    清空
                </Button>
            </View>
            <MusicList
                musicList={musicHistoryList}
                showIndex
                musicSheet={{
                    id: musicHistorySheetId,
                    title: '播放记录',
                    musicList: musicHistoryList,
                }}
            />
            <MusicBar />
        </VerticalSafeAreaView>
    );
}

const style = StyleSheet.create({
    opeartions: {
        height: rpx(88),
        flexDirection: 'row',
        alignItems: 'center',
        width: '100%',
        paddingHorizontal: rpx(24),
    },
});
