import repeatModeConst from "@/constants/repeatModeConst";
import rpx from "@/utils/rpx";
import React from "react";
import {
    ActivityIndicator,
    InteractionManager,
    StyleSheet,
    View,
} from "react-native";

import Icon from "@/components/base/icon.tsx";
import { showPanel } from "@/components/panels/usePanel";
import TrackPlayer, { useMusicState, useRepeatMode } from "@/core/trackPlayer";
import useOrientation from "@/hooks/useOrientation";
import delay from "@/utils/delay";
import { musicIsBuffering, musicIsPaused } from "@/utils/trackUtils";

export default function () {
    const repeatMode = useRepeatMode();
    const musicState = useMusicState();

    const orientation = useOrientation();

    return (
        <>
            <View
                style={[
                    style.wrapper,
                    orientation === "horizontal"
                        ? {
                            marginTop: 0,
                        }
                        : null,
                ]}>
                <Icon
                    color={"white"}
                    name={repeatModeConst[repeatMode].icon}
                    size={rpx(56)}
                    onPress={async () => {
                        InteractionManager.runAfterInteractions(async () => {
                            await delay(20, false);
                            TrackPlayer.toggleRepeatMode();
                        });
                    }}
                />
                <Icon
                    color={"white"}
                    name={"skip-left"}
                    size={rpx(56)}
                    onPress={() => {
                        TrackPlayer.skipToPrevious();
                    }}
                />
                {musicIsBuffering(musicState) ? (
                    // 缓冲中显示加载圈，避免网速慢时误以为点了没反应
                    <View style={style.indicatorContainer}>
                        <ActivityIndicator size={rpx(72)} color={"white"} />
                    </View>
                ) : (
                    <Icon
                        color={"white"}
                        name={musicIsPaused(musicState) ? "play" : "pause"}
                        size={rpx(96)}
                        onPress={() => {
                            if (musicIsPaused(musicState)) {
                                TrackPlayer.play();
                            } else {
                                TrackPlayer.pause();
                            }
                        }}
                    />
                )}
                <Icon
                    color={"white"}
                    name={"skip-right"}
                    size={rpx(56)}
                    onPress={() => {
                        TrackPlayer.skipToNext();
                    }}
                />
                <Icon
                    color={"white"}
                    name={"playlist"}
                    size={rpx(56)}
                    onPress={() => {
                        showPanel("PlayList");
                    }}
                />
            </View>
        </>
    );
}

const style = StyleSheet.create({
    wrapper: {
        width: "100%",
        marginTop: rpx(36),
        height: rpx(100),
        flexDirection: "row",
        justifyContent: "space-around",
        alignItems: "center",
    },
    // 和播放按钮同尺寸，切换时布局不会跳动
    indicatorContainer: {
        width: rpx(96),
        height: rpx(96),
        justifyContent: "center",
        alignItems: "center",
    },
});
