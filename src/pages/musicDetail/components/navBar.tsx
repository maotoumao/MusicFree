import React from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import rpx from "@/utils/rpx";
import Icon from "@/components/base/icon.tsx";
import ThemeText from "@/components/base/themeText";
import useColors from "@/hooks/useColors";
import { useCurrentMusic } from "@/core/trackPlayer";
import MusicSheet, { useFavorite } from "@/core/musicSheet";

export default function NavBar() {
    const colors = useColors();
    const musicItem = useCurrentMusic();
    const isFavorite = useFavorite(musicItem);

    return (
        <View style={styles.container}>
            <View style={styles.titleMain}>
                <ThemeText
                    fontSize="title"
                    fontWeight="bold"
                    numberOfLines={1}
                    style={styles.titleText}>
                    {musicItem?.title ?? "--"}
                </ThemeText>
                <ThemeText
                    fontSize="subTitle"
                    numberOfLines={1}
                    style={styles.artistText}>
                    {musicItem?.artist}
                </ThemeText>
            </View>
            <TouchableOpacity
                style={styles.favoriteButton}
                accessible
                accessibilityLabel={"收藏或取消收藏歌曲"}
                onPress={() => {
                    if (!musicItem) {
                        return;
                    }
                    if (isFavorite) {
                        MusicSheet.removeMusic(
                            MusicSheet.defaultSheet.id,
                            musicItem,
                        );
                    } else {
                        MusicSheet.addMusic(
                            MusicSheet.defaultSheet.id,
                            musicItem,
                        );
                    }
                }}>
                <Icon
                    name={isFavorite ? "heart" : "heart-outline"}
                    size={rpx(48)}
                    color={isFavorite ? colors.primary : "white"}
                />
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        width: "100%",
        height: rpx(120),
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: rpx(52),
    },
    titleMain: {
        flex: 1,
        marginRight: rpx(16),
    },
    titleText: {
        color: "white",
        includeFontPadding: false,
    },
    artistText: {
        color: "rgba(255,255,255,0.6)",
        includeFontPadding: false,
        marginTop: rpx(4),
    },
    favoriteButton: {
        padding: rpx(8),
    },
});
