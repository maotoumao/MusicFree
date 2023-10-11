import React from 'react';
import {StyleSheet, View} from 'react-native';
import rpx from '@/utils/rpx';
import ThemeText from '@/components/base/themeText';
import repeatModeConst from '@/constants/repeatModeConst';
import MusicQueue from '@/core/musicQueue';
import IconTextButton from '@/components/base/iconTextButton';

export default function Header() {
    const repeatMode = MusicQueue.useRepeatMode();
    const musicQueue = MusicQueue.useMusicQueue();

    return (
        <View style={style.wrapper}>
            <ThemeText
                style={style.headerText}
                fontSize="title"
                fontWeight="bold">
                播放列表
                <ThemeText fontColor="textSecondary">
                    {' '}
                    ({musicQueue.length}首)
                </ThemeText>
            </ThemeText>
            <IconTextButton
                onPress={() => {
                    MusicQueue.toggleRepeatMode();
                }}
                icon={repeatModeConst[repeatMode].icon}>
                {repeatModeConst[repeatMode].text}
            </IconTextButton>
            <IconTextButton
                icon="trash-can-outline"
                onPress={() => {
                    MusicQueue.clear();
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
        marginTop: rpx(24),
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    headerText: {
        flex: 1,
    },
});
