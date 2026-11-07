import React from "react";
import { InteractionManager, StyleSheet, View } from "react-native";
import rpx from "@/utils/rpx";
import useColors from "@/hooks/useColors";

import Icon from "@/components/base/icon.tsx";
import { showPanel } from "@/components/panels/usePanel";
import TrackPlayer, {
    useCurrentMusic,
    useRepeatMode,
} from "@/core/trackPlayer";
import repeatModeConst from "@/constants/repeatModeConst";
import delay from "@/utils/delay";
import Toast from "@/utils/toast";
import i18n from "@/core/i18n";
import { ROUTE_PATH } from "@/core/router";

export default function ExtraControls() {
    const colors = useColors();
    const repeatMode = useRepeatMode();
    const musicItem = useCurrentMusic();

    return (
        <View style={style.wrapper}>
            <Icon
                color={colors.text}
                name={repeatModeConst[repeatMode].icon}
                size={rpx(48)}
                onPress={async () => {
                    InteractionManager.runAfterInteractions(async () => {
                        await delay(20, false);
                        TrackPlayer.toggleRepeatMode();
                    });
                }}
            />
            <Icon
                color={colors.text}
                name="timer"
                size={rpx(48)}
                onPress={() => {
                    showPanel("TimingClose");
                }}
            />
            <Icon
                color={colors.text}
                name="graphic-eq"
                size={rpx(48)}
                onPress={() => {
                    if (!musicItem) {
                        return;
                    }
                    showPanel("MusicQuality", {
                        musicItem,
                        async onQualityPress(quality) {
                            const changeResult =
                                await TrackPlayer.changeQuality(quality);
                            if (!changeResult) {
                                Toast.warn(
                                    i18n.t(
                                        "toast.currentQualityNotAvailableForCurrentMusic",
                                    ),
                                );
                            }
                        },
                    });
                }}
            />
            <Icon
                color={colors.text}
                name="playlist"
                size={rpx(48)}
                onPress={() => {
                    showPanel("PlayList");
                }}
            />
            <Icon
                color={colors.text}
                name="ellipsis-horizontal"
                size={rpx(48)}
                onPress={() => {
                    if (musicItem) {
                        showPanel("MusicItemOptions", {
                            musicItem: musicItem,
                            from: ROUTE_PATH.MUSIC_DETAIL,
                        });
                    }
                }}
            />
        </View>
    );
}

const style = StyleSheet.create({
    wrapper: {
        width: "100%",
        height: rpx(88),
        flexDirection: "row",
        justifyContent: "space-around",
        alignItems: "center",
        paddingHorizontal: rpx(48),
        opacity: 0.85,
    },
});
