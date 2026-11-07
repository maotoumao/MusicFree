import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import rpx from "@/utils/rpx";
import ThemeText from "@/components/base/themeText";
import { ImgAsset } from "@/constants/assetsConst";
import FastImage from "@/components/base/fastImage";
import LinearGradient from "react-native-linear-gradient";
import Icon from "@/components/base/icon.tsx";
import TrackPlayer from "@/core/trackPlayer";
import { MusicRepeatMode } from "@/constants/repeatModeConst";
import { showPanel } from "@/components/panels/usePanel";

interface IHeaderProps {
    musicSheet: IMusic.IMusicSheetItem | null;
    musicList: IMusic.IMusicItem[] | null;
    navTitle: string;
}

export default function Header(props: IHeaderProps) {
    const { musicSheet, musicList, navTitle } = props;

    const cover = musicSheet?.artwork ?? musicSheet?.coverImg;
    const worksNum =
        musicSheet?.worksNum ?? (musicList ? musicList.length ?? 0 : "-");

    // 播放全部: 随机模式下从随机曲目开始
    const playAll = (shuffle?: boolean) => {
        if (!musicList?.length) {
            return;
        }
        let defaultPlayMusic = musicList[0];
        if (
            shuffle ||
            TrackPlayer.repeatMode === MusicRepeatMode.SHUFFLE
        ) {
            defaultPlayMusic =
                musicList[Math.floor(Math.random() * musicList.length)];
        }
        TrackPlayer.playWithReplacePlayList(defaultPlayMusic, musicList);
    };

    return (
        <View>
            <View style={styles.coverWrapper}>
                <FastImage
                    style={styles.cover}
                    resizeMode="cover"
                    source={cover}
                    placeholderSource={ImgAsset.albumDefault}
                />
                {/* 顶部渐暗, 保证白色顶栏图标可读 */}
                <LinearGradient
                    style={[StyleSheet.absoluteFill, styles.topMask]}
                    colors={["rgba(0,0,0,0.45)", "rgba(0,0,0,0)"]}
                    pointerEvents="none"
                />
                {/* 底部渐暗, 衬托标题与操作行 */}
                <LinearGradient
                    style={[StyleSheet.absoluteFill, styles.bottomMask]}
                    colors={["rgba(0,0,0,0)", "rgba(0,0,0,0) 55%", "rgb(0, 0, 0)"]}
                    pointerEvents="none"
                />
                {/* 标题覆盖区 */}
                <View style={styles.titleOverlay} pointerEvents="none">
                    <ThemeText
                        style={styles.title}
                        fontWeight="bold"
                        numberOfLines={2}>
                        {"[NEW] "}{musicSheet?.title ?? navTitle}
                    </ThemeText>
                    <Text style={styles.subtitle} numberOfLines={1}>
                        {musicSheet?.artist ?? `共${worksNum}首`}
                    </Text>
                </View>
                {/* 操作行 */}
                <View style={styles.actions}>
                    <TouchableOpacity
                        style={styles.roundBtn}
                        accessible
                        accessibilityLabel="随机播放全部"
                        onPress={() => {
                            playAll(true);
                        }}>
                        <Icon name="shuffle" color="white" size={rpx(44)} />
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={styles.playCapsule}
                        accessible
                        accessibilityLabel="播放全部"
                        onPress={() => {
                            playAll(false);
                        }}>
                        <Icon name="play" color="#111111" size={rpx(40)} />
                        <Text style={styles.playText}>播放</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={styles.roundBtn}
                        accessible
                        accessibilityLabel="添加歌曲到歌单"
                        onPress={() => {
                            showPanel("AddToMusicSheet", {
                                musicItem: musicList ?? [],
                                newSheetDefaultName: musicSheet?.title,
                            });
                        }}>
                        <Icon name="plus" color="white" size={rpx(48)} />
                    </TouchableOpacity>
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    coverWrapper: {
        width: "100%",
        height: rpx(880),
    },
    cover: {
        width: "100%",
        height: "100%",
    },
    topMask: {},
    bottomMask: {},
    titleOverlay: {
        position: "absolute",
        left: rpx(32),
        right: rpx(32),
        bottom: rpx(160),
        alignItems: "center",
    },
    title: {
        color: "white",
        fontSize: rpx(44),
        includeFontPadding: false,
        textAlign: "center",
    },
    subtitle: {
        color: "rgba(255,255,255,0.8)",
        fontSize: rpx(30),
        includeFontPadding: false,
        marginTop: rpx(12),
    },
    actions: {
        position: "absolute",
        width: "100%",
        bottom: rpx(28),
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
    },
    roundBtn: {
        width: rpx(96),
        height: rpx(96),
        borderRadius: rpx(48),
        backgroundColor: "rgba(124, 124, 124, 0.34)",
        justifyContent: "center",
        alignItems: "center",
    },
    playCapsule: {
        width: rpx(320),
        height: rpx(96),
        borderRadius: rpx(48),
        marginHorizontal: rpx(32),
        backgroundColor: "#F5F1EC",
        flexDirection: "row",
        justifyContent: "center",
        alignItems: "center",
    },
    playText: {
        color: "#111111",
        fontSize: rpx(34),
        fontWeight: "600",
        marginLeft: rpx(12),
        includeFontPadding: false,
    },
});
