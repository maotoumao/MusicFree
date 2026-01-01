import React from "react";
import { StyleSheet, Text, View, TouchableOpacity } from "react-native";
import rpx from "@/utils/rpx";
import Tag from "@/components/base/tag";
import { fontSizeConst, fontWeightConst } from "@/constants/uiConst";
import TrackPlayer, { useCurrentMusic, useMusicQuality } from "@/core/trackPlayer";
import { showPanel } from "@/components/panels/usePanel";
import Toast from "@/utils/toast";
import i18n from "@/core/i18n";

export default function MusicInfo() {
    const musicItem = useCurrentMusic();
    const currentQuality = useMusicQuality();

    const onQualityPress = () => {
        if (!musicItem) {
            return;
        }
        showPanel("MusicQuality", {
            musicItem,
            async onQualityPress(quality) {
                const changeResult =
                    await TrackPlayer.changeQuality(quality);
                if (!changeResult) {
                    Toast.warn(i18n.t("toast.currentQualityNotAvailableForCurrentMusic"));
                }
            },
        });
    };

    return (
        <View style={styles.infoContainer}>
            <Text numberOfLines={2} style={styles.titleText}>
                {musicItem?.title ?? "--"}
            </Text>
            <View style={styles.descContainer}>
                <Text style={styles.artistText} numberOfLines={1}>
                    {musicItem?.artist}
                </Text>
                {currentQuality ? (
                    <TouchableOpacity onPress={onQualityPress} activeOpacity={0.7} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                        <Tag
                            tagName={i18n.t(`musicQuality.${currentQuality}`)}
                            containerStyle={[styles.tagBg, styles.qualityTag]}
                            style={styles.tagText}
                        />
                    </TouchableOpacity>
                ) : null}
                {musicItem?.platform ? (
                    <Tag
                        tagName={musicItem.platform}
                        containerStyle={styles.tagBg}
                        style={styles.tagText}
                    />
                ) : null}

            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    infoContainer: {
        width: "100%",
        paddingHorizontal: rpx(48),
        marginBottom: rpx(48),
        alignItems: "flex-start",
    },
    titleText: {
        color: "white",
        fontWeight: fontWeightConst.semibold,
        fontSize: fontSizeConst.title,
        marginBottom: rpx(16),
    },
    descContainer: {
        flexDirection: "row",
        alignItems: "center",
        maxWidth: "100%",
    },
    artistText: {
        color: "rgba(255,255,255,0.8)",
        fontSize: fontSizeConst.subTitle,
        marginRight: rpx(12),
        flexShrink: 1,
    },
    tagBg: {
        backgroundColor: "rgba(255, 255, 255, 0.2)",
    },
    tagText: {
        color: "white",
    },
    qualityTag: {
        marginLeft: rpx(12),
    },
});
