import React, {memo, useEffect, useState} from 'react';
import {Keyboard, Pressable, StyleSheet, Text, View} from 'react-native';
import rpx from '@/utils/rpx';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import MusicQueue from '@/core/musicQueue';
import {CircularProgressBase} from 'react-native-circular-progress-indicator';
import {ROUTE_PATH, useNavigate} from '@/entry/router';

import musicIsPaused from '@/utils/musicIsPaused';

import Color from 'color';
import ThemeText from '../base/themeText';
import {ImgAsset} from '@/constants/assetsConst';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {showPanel} from '../panels/usePanel';
import FastImage from '../base/fastImage';
import useColors from '@/hooks/useColors';
import IconButton from '../base/iconButton';

function CircularPlayBtn() {
    const progress = MusicQueue.useProgress();
    const musicState = MusicQueue.usePlaybackState();
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
                accessibilityLabel={isPaused ? '播放' : '暂停'}
                name={isPaused ? 'play' : 'pause'}
                sizeType={'normal'}
                color={colors.musicBarText}
                onPress={async () => {
                    if (isPaused) {
                        await MusicQueue.play();
                    } else {
                        await MusicQueue.pause();
                    }
                }}
            />
        </CircularProgressBase>
    );
}
function MusicBar() {
    const musicItem = MusicQueue.useCurrentMusicItem();

    const [showKeyboard, setKeyboardStatus] = useState(false);

    const navigate = useNavigate();
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
                <Pressable
                    style={[
                        style.wrapper,
                        {
                            backgroundColor: colors.musicBar,
                            paddingLeft: safeAreaInsets.left + rpx(24),
                            paddingRight: safeAreaInsets.right + rpx(24),
                        },
                    ]}
                    accessible
                    accessibilityLabel={`歌曲: ${musicItem.title} 歌手: ${musicItem.artist}`}
                    onPress={() => {
                        navigate(ROUTE_PATH.MUSIC_DETAIL);
                    }}>
                    <View style={style.artworkWrapper}>
                        <FastImage
                            style={style.artworkImg}
                            uri={musicItem.artwork}
                            emptySrc={ImgAsset.albumDefault}
                        />
                    </View>
                    <Text
                        ellipsizeMode="tail"
                        accessible={false}
                        style={style.textWrapper}
                        numberOfLines={1}>
                        <ThemeText fontSize="content" fontColor="musicBarText">
                            {musicItem?.title}
                        </ThemeText>
                        {musicItem?.artist && (
                            <ThemeText
                                fontSize="description"
                                color={Color(colors.musicBarText)
                                    .alpha(0.6)
                                    .toString()}>
                                {' '}
                                -{musicItem.artist}
                            </ThemeText>
                        )}
                    </Text>
                    <View style={style.actionGroup}>
                        <CircularPlayBtn />
                        <Icon
                            accessible
                            accessibilityLabel="播放列表"
                            name="playlist-music"
                            size={rpx(56)}
                            onPress={() => {
                                showPanel('PlayList');
                            }}
                            style={[
                                style.actionIcon,
                                {color: colors.musicBarText},
                            ]}
                        />
                    </View>
                </Pressable>
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
        paddingHorizontal: rpx(24),
    },
    artworkWrapper: {
        height: rpx(120),
        width: rpx(120),
        justifyContent: 'center',
    },
    textWrapper: {
        flexGrow: 1,
        flexShrink: 1,
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
    artworkImg: {
        width: rpx(96),
        height: rpx(96),
        borderRadius: rpx(48),
    },
});
