import React from 'react';
import {StyleSheet, View} from 'react-native';
import rpx from '@/utils/rpx';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import repeatModeConst from '@/constants/repeatModeConst';

import useOrientation from '@/hooks/useOrientation';
import {showPanel} from '@/components/panels/usePanel';
import TrackPlayer from '@/core/trackPlayer';
import {musicIsPaused} from '@/utils/trackUtils';

export default function () {
    const repeatMode = TrackPlayer.useRepeatMode();
    const musicState = TrackPlayer.useMusicState();

    const orientation = useOrientation();

    return (
        <>
            <View
                style={[
                    style.wrapper,
                    orientation === 'horizonal'
                        ? {
                              marginTop: 0,
                          }
                        : null,
                ]}>
                <Icon
                    color={'white'}
                    name={repeatModeConst[repeatMode].icon}
                    size={rpx(56)}
                    onPress={() => {
                        TrackPlayer.toggleRepeatMode();
                    }}
                />
                <Icon
                    color={'white'}
                    name={'skip-previous'}
                    size={rpx(56)}
                    onPress={() => {
                        TrackPlayer.skipToPrevious();
                    }}
                />
                <Icon
                    color={'white'}
                    name={
                        musicIsPaused(musicState)
                            ? 'play-circle-outline'
                            : 'pause-circle-outline'
                    }
                    size={rpx(96)}
                    onPress={() => {
                        if (musicIsPaused(musicState)) {
                            TrackPlayer.play();
                        } else {
                            TrackPlayer.pause();
                        }
                    }}
                />
                <Icon
                    color={'white'}
                    name={'skip-next'}
                    size={rpx(56)}
                    onPress={() => {
                        TrackPlayer.skipToNext();
                    }}
                />
                <Icon
                    color={'white'}
                    name={'playlist-music'}
                    size={rpx(56)}
                    onPress={() => {
                        showPanel('PlayList');
                    }}
                />
            </View>
        </>
    );
}

const style = StyleSheet.create({
    wrapper: {
        width: '100%',
        marginTop: rpx(36),
        height: rpx(100),
        flexDirection: 'row',
        justifyContent: 'space-around',
        alignItems: 'center',
    },
});
