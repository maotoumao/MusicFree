import rpx from "@/utils/rpx";
import React from "react";
import { StyleSheet, View } from "react-native";

import Icon from "@/components/base/icon.tsx";
import TrackPlayer, { useMusicState } from "@/core/trackPlayer";
import { musicIsPaused } from "@/utils/trackUtils";

export default function () {
    const musicState = useMusicState();

    return (
        <View style={style.wrapper}>
            <Icon
                color="white"
                name={"skip-left"}
                size={rpx(70)}
                onPress={() => {
                    TrackPlayer.skipToPrevious();
                }}
            />
            <Icon
                color="white"
                name={musicIsPaused(musicState) ? "play" : "pause"}
                size={rpx(90)}
                onPress={() => {
                    if (musicIsPaused(musicState)) {
                        TrackPlayer.play();
                    } else {
                        TrackPlayer.pause();
                    }
                }}
            />
            <Icon
                color="white"
                name={"skip-right"}
                size={rpx(70)}
                onPress={() => {
                    TrackPlayer.skipToNext();
                }}
            />
        </View>
    );
}

const style = StyleSheet.create({
    wrapper: {
        width: "100%",
        flexDirection: "row",
        justifyContent: "center",
        alignItems: "center",
        gap: rpx(100),
        height: rpx(120),
    },
});
