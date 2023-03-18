import React, {memo, useEffect, useState} from 'react';
import {Keyboard, Pressable, StyleSheet, Text, View} from 'react-native';
import rpx from '@/utils/rpx';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import MusicQueue from '@/core/musicQueue';
import {Avatar, IconButton, useTheme} from 'react-native-paper';
import {CircularProgressBase} from 'react-native-circular-progress-indicator';
import {ROUTE_PATH, useNavigate} from '@/entry/router';

import musicIsPaused from '@/utils/musicIsPaused';
import usePanel from '../panels/usePanel';
import Color from 'color';
import ThemeText from '../base/themeText';
import {ImgAsset} from '@/constants/assetsConst';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

function CircularPlayBtn() {
    const progress = MusicQueue.useProgress();
    const musicState = MusicQueue.usePlaybackState();
    const {colors} = useTheme();

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
            activeStrokeColor={colors.text}
            inActiveStrokeColor={Color(colors.text).alpha(0.5).toString()}>
            {musicIsPaused(musicState) ? (
                <IconButton
                    icon="play"
                    size={rpx(48)}
                    onPress={async () => {
                        await MusicQueue.play();
                    }}
                />
            ) : (
                <IconButton
                    icon="pause"
                    size={rpx(48)}
                    onPress={async () => {
                        await MusicQueue.pause();
                    }}
                />
            )}
        </CircularProgressBase>
    );
}
function MusicBar() {
    const musicItem = MusicQueue.useCurrentMusicItem();

    const [showKeyboard, setKeyboardStatus] = useState(false);
    const {showPanel} = usePanel();
    const navigate = useNavigate();
    const {colors} = useTheme();
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
                            backgroundColor: Color(colors.primary)
                                .alpha(0.66)
                                .toString(),
                            paddingLeft: safeAreaInsets.left + rpx(24),
                            paddingRight: safeAreaInsets.right + rpx(24),
                        },
                    ]}
                    onPress={() => {
                        navigate(ROUTE_PATH.MUSIC_DETAIL);
                    }}>
                    <View style={style.artworkWrapper}>
                        <Avatar.Image
                            size={rpx(96)}
                            source={
                                musicItem?.artwork
                                    ? {
                                          uri: musicItem.artwork,
                                      }
                                    : ImgAsset.albumDefault
                            }
                        />
                    </View>
                    <Text
                        ellipsizeMode="tail"
                        style={style.textWrapper}
                        numberOfLines={1}>
                        <ThemeText fontSize="content">
                            {musicItem?.title}
                        </ThemeText>
                        {musicItem?.artist && (
                            <ThemeText
                                fontSize="description"
                                fontColor="secondary">
                                {' '}
                                -{musicItem.artist}
                            </ThemeText>
                        )}
                    </Text>
                    <View style={style.actionGroup}>
                        <CircularPlayBtn />

                        <Icon
                            name="playlist-music"
                            size={rpx(56)}
                            onPress={() => {
                                showPanel('PlayList');
                            }}
                            style={[style.actionIcon, {color: colors.text}]}
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
        height: rpx(120),
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: rpx(24),
    },
    artworkWrapper: {
        height: rpx(120),
        width: rpx(120),
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
});
