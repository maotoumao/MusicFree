import React, { useMemo } from "react";
import rpx from "@/utils/rpx";
import { ImgAsset } from "@/constants/assetsConst";
import FastImage from "@/components/base/fastImage";
import useOrientation from "@/hooks/useOrientation";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useCurrentMusic } from "@/core/trackPlayer";
import globalStyle from "@/constants/globalStyle";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import { showPanel } from "@/components/panels/usePanel.ts";
import ThemeText from "@/components/base/themeText";
import Tag from "@/components/base/tag";
import Icon from "@/components/base/icon.tsx";
import MusicSheet, { useFavorite } from "@/core/musicSheet";
import { ROUTE_PATH } from "@/core/router";

interface IProps {
    onTurnPageClick?: () => void;
}

export default function AlbumCover(props: IProps) {
    const { onTurnPageClick } = props;

    const musicItem = useCurrentMusic();
    const orientation = useOrientation();
    const isFavorite = useFavorite(musicItem);

    const artworkStyle = useMemo(() => {
        if (orientation === "vertical") {
            return {
                width: rpx(646),
                height: rpx(646),
                borderRadius: rpx(16),
            };
        } else {
            return {
                width: rpx(260),
                height: rpx(260),
                borderRadius: rpx(16),
            };
        }
    }, [orientation]);

    const longPress = Gesture.LongPress()
        .onStart(() => {
            if (musicItem?.artwork) {
                showPanel("ImageViewer", {
                    url: musicItem.artwork,
                });
            }
        })
        .runOnJS(true);

    const tap = Gesture.Tap()
        .onStart(() => {
            onTurnPageClick?.();
        })
        .runOnJS(true);

    const combineGesture = Gesture.Race(tap, longPress);

    return (
        <>
            <GestureDetector gesture={combineGesture}>
                <View style={styles.artworkContainer}>
                    <FastImage
                        style={artworkStyle}
                        source={musicItem?.artwork}
                        placeholderSource={ImgAsset.albumDefault}
                    />
                </View>
            </GestureDetector>
            {orientation === "vertical" ? (
                <View style={styles.titleRow}>
                    <View style={styles.titleMain}>
                        <ThemeText
                            fontSize="title"
                            fontWeight="semibold"
                            numberOfLines={1}
                            style={styles.titleText}>
                            {musicItem?.title ?? "--"}
                        </ThemeText>
                        <View style={styles.artistRow}>
                            <ThemeText
                                fontSize="subTitle"
                                numberOfLines={1}
                                style={styles.artistText}>
                                {musicItem?.artist}
                            </ThemeText>
                            {musicItem?.platform ? (
                                <Tag
                                    tagName={musicItem.platform}
                                    containerStyle={styles.tagBg}
                                    style={styles.tagText}
                                />
                            ) : null}
                        </View>
                    </View>
                    <View style={styles.titleIcons}>
                        <TouchableOpacity
                            style={styles.iconCircle}
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
                                size={rpx(40)}
                                color={isFavorite ? "#FA2D48" : "white"}
                            />
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.iconCircle}
                            accessible
                            accessibilityLabel={"更多操作"}
                            onPress={() => {
                                if (musicItem) {
                                    showPanel("MusicItemOptions", {
                                        musicItem: musicItem,
                                        from: ROUTE_PATH.MUSIC_DETAIL,
                                    });
                                }
                            }}>
                            <Icon
                                name="ellipsis-horizontal"
                                size={rpx(40)}
                                color="white"
                            />
                        </TouchableOpacity>
                    </View>
                </View>
            ) : null}
        </>
    );
}

const styles = StyleSheet.create({
    artworkContainer: {
        ...globalStyle.fullCenter,
        shadowColor: "#000",
        shadowOffset: {
            width: 0,
            height: 8,
        },
        shadowOpacity: 0.4,
        shadowRadius: 12,
        elevation: 12,
    },
    titleRow: {
        width: "100%",
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: rpx(52),
        marginTop: rpx(56),
    },
    titleMain: {
        flex: 1,
        marginRight: rpx(24),
    },
    titleText: {
        color: "white",
        includeFontPadding: false,
    },
    artistRow: {
        flexDirection: "row",
        alignItems: "center",
        marginTop: rpx(8),
    },
    artistText: {
        color: "rgba(255,255,255,0.7)",
        fontSize: rpx(38),
        includeFontPadding: false,
        marginRight: rpx(16),
    },
    tagBg: {
        backgroundColor: "rgba(255, 255, 255, 0.2)",
    },
    tagText: {
        color: "white",
    },
    titleIcons: {
        flexDirection: "row",
        alignItems: "center",
        gap: rpx(30),
    },
    iconCircle: {
        width: rpx(64),
        height: rpx(64),
        borderRadius: rpx(32),
        backgroundColor: "rgba(255, 255, 255, 0.2)",
        justifyContent: "center",
        alignItems: "center",
    },
});
