import React from 'react';
import {StyleSheet, View} from 'react-native';
import rpx from '@/utils/rpx';
import ThemeText from '@/components/base/themeText';
import repeatModeConst from '@/constants/repeatModeConst';
import MusicQueue from '@/core/musicQueue';
import useTextColor from '@/hooks/useTextColor';
import {Button} from 'react-native-paper';

export default function Header() {
    const repeatMode = MusicQueue.useRepeatMode();
    const musicQueue = MusicQueue.useMusicQueue();
    const textColor = useTextColor();

    return (
        <View style={style.wrapper}>
            <ThemeText
                style={style.headerText}
                fontSize="title"
                fontWeight="bold">
                播放列表
                <ThemeText fontColor="secondary">
                    {' '}
                    ({musicQueue.length}首)
                </ThemeText>
            </ThemeText>
            <Button
                color={textColor}
                onPress={() => {
                    MusicQueue.toggleRepeatMode();
                }}
                icon={repeatModeConst[repeatMode].icon}>
                {repeatModeConst[repeatMode].text}
            </Button>
            <Button
                color={textColor}
                onPress={() => {
                    MusicQueue.clear();
                }}
                icon={'trash-can-outline'}>
                清空
            </Button>
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
