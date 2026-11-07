import React, { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import rpx from "@/utils/rpx";

import Icon from "@/components/base/icon.tsx";
import { showPanel } from "@/components/panels/usePanel";
import TrackPlayer, {
    useCurrentMusic,
    useRepeatMode,
} from "@/core/trackPlayer";
import repeatModeConst from "@/constants/repeatModeConst";
import { InteractionManager } from "react-native";
import delay from "@/utils/delay";
import PluginManager from "@/core/pluginManager";
import Toast from "@/utils/toast";
import i18n from "@/core/i18n";

export default function ExtraControls() {
    const repeatMode = useRepeatMode();
    const musicItem = useCurrentMusic();

    const supportComment = useMemo(() => {
        return !musicItem
            ? false
            : !!PluginManager.getByMedia(musicItem)?.supportedMethods.has(
                "getMusicComments",
            );
    }, [musicItem]);

    return (
        <View style={style.wrapper}>
            <Icon
                color="white"
                name="chat-bubble-oval-left-ellipsis"
                size={rpx(48)}
                opacity={supportComment ? 1 : 0.2}
                onPress={() => {
                    if (!supportComment) {
                        Toast.warn(
                            i18n.t("toast.commmentNotAvaliableForCurrentMusic"),
                        );
                        return;
                    }
                    if (musicItem) {
                        showPanel("MusicComment", { musicItem });
                    }
                }}
            />
            <Icon
                color="white"
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
                color="white"
                name="playlist"
                size={rpx(48)}
                onPress={() => {
                    showPanel("PlayList");
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
        paddingHorizontal: rpx(64),
        opacity: 0.8,
    },
});
