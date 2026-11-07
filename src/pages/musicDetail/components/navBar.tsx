import React from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import rpx from "@/utils/rpx";
import { useNavigation } from "@react-navigation/native";
import IconButton from "@/components/base/iconButton";
import ThemeText from "@/components/base/themeText";
import Icon from "@/components/base/icon.tsx";
import useColors from "@/hooks/useColors";
import { useCurrentMusic } from "@/core/trackPlayer";
import MusicSheet, { useFavorite } from "@/core/musicSheet";

export default function NavBar() {
    const navigation = useNavigation();
    const colors = useColors();
    const musicItem = useCurrentMusic();
    const isFavorite = useFavorite(musicItem);

    return (
        <View style={styles.container}>
            <IconButton
                name="arrow-left"
                sizeType={"normal"}
                color={colors.text}
                onPress={() => {
                    navigation.goBack();
                }}
            />
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
                    color={isFavorite ? colors.primary : colors.text}
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
        paddingHorizontal: rpx(24),
    },
    titleMain: {
        flex: 1,
        marginLeft: rpx(16),
        marginRight: rpx(16),
    },
    titleText: {
        color: undefined,
        includeFontPadding: false,
    },
    artistText: {
        includeFontPadding: false,
        marginTop: rpx(4),
        opacity: 0.6,
    },
    favoriteButton: {
        padding: rpx(8),
    },
});
