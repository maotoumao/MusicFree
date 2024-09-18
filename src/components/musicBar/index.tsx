import React, {memo, useEffect, useState} from 'react';
import {Keyboard, StyleSheet, View} from 'react-native';
import rpx from '@/utils/rpx';
import {CircularProgressBase} from 'react-native-circular-progress-indicator';

import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {showPanel} from '../panels/usePanel';
import useColors from '@/hooks/useColors';
import IconButton from '../base/iconButton';
import TrackPlayer from '@/core/trackPlayer';
import {musicIsPaused} from '@/utils/trackUtils';
import MusicInfo from './musicInfo';
import Icon from '@/components/base/icon.tsx';

function CircularPlayBtn() {
    const progress = TrackPlayer.useProgress();
    const musicState = TrackPlayer.useMusicState();
    const colors = useColors();

    const isPaused = musicIsPaused(musicState);

    return (
        <CircularProgressBase
            activeStrokeWidth={rpx(4)}
            inActiveStrokeWidth={rpx(2)}
            inActiveStrokeOpacity={0.2}
            value={
                progress?.duration
                    ? (100 * progress.position) / progress.duration
                    : 0
            }
            duration={100}
            radius={rpx(36)}
            activeStrokeColor={colors.musicBarText}
            inActiveStrokeColor={colors.textSecondary}>
            <IconButton
                accessibilityLabel={'播放或暂停歌曲'}
                name={isPaused ? 'play' : 'pause'}
                sizeType={'normal'}
                hitSlop={{
                    top: 10,
                    left: 10,
                    right: 10,
                    bottom: 10,
                }}
                color={colors.musicBarText}
                onPress={async () => {
                    if (isPaused) {
                        await TrackPlayer.play();
                    } else {
                        await TrackPlayer.pause();
                    }
                }}
            />
        </CircularProgressBase>
    );
}
function MusicBar() {
    const musicItem = TrackPlayer.useCurrentMusic();

    const [showKeyboard, setKeyboardStatus] = useState(false);

    const colors = useColors();
    const safeAreaInsets = useSafeAreaInsets();

    useEffect(() => {
        const showSubscription = Keyboard.addListener('keyboardDidShow', () => {
            setKeyboardStatus(true);
        });
        const hideSubscription = Keyboard.addListener('keyboardDidHide', () => {
            setKeyboardStatus(false);
        });

        return () => {
            showSubscription.remove();
            hideSubscription.remove();
        };
    }, []);

    return (
        <>
            {musicItem && !showKeyboard && (
                <View
                    style={[
                        style.wrapper,
                        {
                            backgroundColor: colors.musicBar,
                            paddingRight: safeAreaInsets.right + rpx(24),
                        },
                    ]}
                    accessible
                    accessibilityLabel={`歌曲: ${musicItem.title} 歌手: ${musicItem.artist}`}
                    // onPress={() => {
                    //     navigate(ROUTE_PATH.MUSIC_DETAIL);
                    // }}
                >
                    <MusicInfo musicItem={musicItem} />
                    <View style={style.actionGroup}>
                        <CircularPlayBtn />
                        <Icon
                            accessible
                            accessibilityLabel="播放列表"
                            name="playlist"
                            size={rpx(56)}
                            onPress={() => {
                                showPanel('PlayList');
                            }}
                            color={colors.musicBarText}
                            style={[style.actionIcon]}
                        />
                    </View>
                </View>
            )}
        </>
    );
}

export default memo(MusicBar, () => true);

const style = StyleSheet.create({
    wrapper: {
        width: '100%',
        height: rpx(132),
        flexDirection: 'row',
        alignItems: 'center',
        paddingRight: rpx(24),
    },
    actionGroup: {
        width: rpx(200),
        justifyContent: 'flex-end',
        flexDirection: 'row',
        alignItems: 'center',
    },
    actionIcon: {
        marginLeft: rpx(36),
    },
});
