import IconTextButton from "@/components/base/iconTextButton";
import ThemeText from "@/components/base/themeText";
import repeatModeConst from "@/constants/repeatModeConst";
import { useI18N } from "@/core/i18n";
import TrackPlayer, { usePlayList, useRepeatMode } from "@/core/trackPlayer";
import delay from "@/utils/delay";
import rpx from "@/utils/rpx";
import React from "react";
import { InteractionManager, StyleSheet, View } from "react-native";

export default function Header() {
    const repeatMode = useRepeatMode();
    const playList = usePlayList();
    const { t } = useI18N();

    return (
        <View style={style.wrapper}>
            <ThemeText
                style={style.headerText}
                fontSize="title"
                fontWeight="bold">
                {t("panel.playList.title")}
                <ThemeText fontColor="textSecondary">
                    {t("panel.playList.count", {
                        count: playList.length,
                    })}
                </ThemeText>
            </ThemeText>
            <IconTextButton
                onPress={() => {
                    InteractionManager.runAfterInteractions(async () => {
                        await delay(20, false);
                        TrackPlayer.toggleRepeatMode();
                    });
                }}
                icon={repeatModeConst[repeatMode].icon}>
                {t(("repeatMode." + repeatMode) as any)}
            </IconTextButton>
            <IconTextButton
                icon="trash-outline"
                onPress={() => {
                    TrackPlayer.clearPlayList();
                }}>
                {t("common.clear")}
            </IconTextButton>
        </View>
    );
}

const style = StyleSheet.create({
    wrapper: {
        width: rpx(750),
        height: rpx(80),
        paddingHorizontal: rpx(24),
        marginTop: rpx(18),
        marginBottom: rpx(12),
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
    },
    headerText: {
        flex: 1,
    },
});
