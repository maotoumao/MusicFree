import React, { memo, useEffect, useState } from "react";
import { Keyboard, StyleSheet, View } from "react-native";
import rpx from "@/utils/rpx";
import { CircularProgressBase } from "react-native-circular-progress-indicator";

import { useSafeAreaInsets } from "react-native-safe-area-context";
import { showPanel } from "@/components/panels/usePanel";
import useColors from "@/hooks/useColors";
import IconButton from "../base/iconButton";
import TrackPlayer, { useCurrentMusic, useMusicState, useProgress } from "@/core/trackPlayer";
import { musicIsPaused } from "@/utils/trackUtils";
import MusicInfo from "./musicInfo";

function CircularPlayBtn() {
    const progress = useProgress();
    const musicState = useMusicState();
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
            radius={rpx(34)}
            activeStrokeColor={colors.musicBarText}
            inActiveStrokeColor={colors.textSecondary}>
            <IconButton
                accessibilityLabel={"播放或暂停歌曲"}
                name={isPaused ? "play" : "pause"}
                sizeType={"normal"}
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
    const musicItem = useCurrentMusic();
    const musicState = useMusicState();

    const [showKeyboard, setKeyboardStatus] = useState(false);

    const colors = useColors();
    const safeAreaInsets = useSafeAreaInsets();

    useEffect(() => {
        const showSubscription = Keyboard.addListener("keyboardDidShow", () => {
            setKeyboardStatus(true);
        });
        const hideSubscription = Keyboard.addListener("keyboardDidHide", () => {
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
                >
                    <MusicInfo musicItem={musicItem} />
                    <View style={style.actionGroup}>
                        <CircularPlayBtn />
                        <IconButton
                            accessibilityLabel={"播放列表"}
                            name="playlist"
                            sizeType={"normal"}
                            hitSlop={{
                                top: 12,
                                left: 12,
                                right: 12,
                                bottom: 12,
                            }}
                            color={colors.musicBarText}
                            onPress={() => {
                                showPanel("PlayList");
                            }}
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
        alignSelf: "stretch",
        height: rpx(128),
        flexDirection: "row",
        alignItems: "center",
        paddingRight: rpx(24),
        marginHorizontal: rpx(20),
        marginBottom: rpx(12),
        borderRadius: rpx(100),
        shadowColor: "#000",
        shadowOpacity: 0.35,
        shadowRadius: 12,
        shadowOffset: {
            width: 0,
            height: 6,
        },
        elevation: 10,
    },
    actionGroup: {
        width: rpx(160),
        justifyContent: "flex-end",
        flexDirection: "row",
        alignItems: "center",
    },
    actionIcon: {
        marginLeft: rpx(32),
        marginRight: rpx(12),
    },
});
