import React from "react";
import { StyleSheet, Text, View } from "react-native";
import rpx from "@/utils/rpx";
import { useNavigation } from "@react-navigation/native";
import Tag from "@/components/base/tag";
import { fontSizeConst, fontWeightConst } from "@/constants/uiConst";
import IconButton from "@/components/base/iconButton";
import { useCurrentMusic } from "@/core/trackPlayer";
import { ROUTE_PATH } from "@/core/router";
import { showPanel } from "@/components/panels/usePanel";

export default function NavBar() {
    const navigation = useNavigation();
    const musicItem = useCurrentMusic();

    return (
        <View style={styles.container}>
            <IconButton
                name="arrow-left"
                sizeType={"normal"}
                color="white"
                style={styles.button}
                onPress={() => {
                    navigation.goBack();
                }}
            />
            <View style={styles.headerContent}>
                <Text numberOfLines={1} style={styles.headerTitleText}>
                    {musicItem?.title ?? "--"}
                </Text>
                <View style={styles.headerDesc}>
                    <Text style={styles.headerArtistText} numberOfLines={1}>
                        {musicItem?.artist}
                    </Text>
                    {musicItem?.platform ? (
                        <Tag
                            tagName={musicItem.platform}
                            containerStyle={styles.tagBg}
                            style={styles.tagText}
                        />
                    ) : null}
                </View>
            </View>
            <IconButton
                name="ellipsis-vertical"
                color="white"
                sizeType="normal"
                style={styles.button}
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

const styles = StyleSheet.create({
    container: {
        width: "100%",
        height: rpx(150),
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
    },
    button: {
        marginHorizontal: rpx(24),
    },
    headerContent: {
        flex: 1,
        height: rpx(150),
        justifyContent: "center",
        alignItems: "center",
    },
    headerTitleText: {
        color: "white",
        fontWeight: fontWeightConst.semibold,
        fontSize: fontSizeConst.title,
        marginBottom: rpx(12),
        includeFontPadding: false,
    },
    headerDesc: {
        height: rpx(32),
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: rpx(40),
    },
    headerArtistText: {
        color: "white",
        fontSize: fontSizeConst.subTitle,
        includeFontPadding: false,
    },
    tagBg: {
        backgroundColor: "rgba(255, 255, 255, 0.2)",
    },
    tagText: {
        color: "white",
    },
});
