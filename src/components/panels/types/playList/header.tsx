import React from 'react';
import {InteractionManager, StyleSheet, View} from 'react-native';
import rpx from '@/utils/rpx';
import ThemeText from '@/components/base/themeText';
import repeatModeConst from '@/constants/repeatModeConst';
import IconTextButton from '@/components/base/iconTextButton';
import TrackPlayer from '@/core/trackPlayer';
import sleep from '@/utils/sleep.ts';

export default function Header() {
    const repeatMode = TrackPlayer.useRepeatMode();
    const playList = TrackPlayer.usePlayList();

    return (
        <View style={style.wrapper}>
            <ThemeText
                style={style.headerText}
                fontSize="title"
                fontWeight="bold">
                播放列表
                <ThemeText fontColor="textSecondary">
                    {' '}
                    ({playList.length}首)
                </ThemeText>
            </ThemeText>
            <IconTextButton
                onPress={() => {
                    InteractionManager.runAfterInteractions(async () => {
                        await sleep(20);
                        TrackPlayer.toggleRepeatMode();
                    });
                }}
                icon={repeatModeConst[repeatMode].icon}>
                {repeatModeConst[repeatMode].text}
            </IconTextButton>
            <IconTextButton
                icon="trash-outline"
                onPress={() => {
                    TrackPlayer.clear();
                }}>
                清空
            </IconTextButton>
        </View>
    );
}

const style = StyleSheet.create({
    wrapper: {
        width: rpx(750),
        height: rpx(80),
        paddingHorizontal: rpx(24),
        marginTop: rpx(18),
        marginBottom: rpx(12),
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    headerText: {
        flex: 1,
    },
});
