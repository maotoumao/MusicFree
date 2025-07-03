import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import rpx from "@/utils/rpx";
import { iconSizeConst } from "@/constants/uiConst";
import { ROUTE_PATH, useNavigate } from "@/core/router";
import ThemeText from "./themeText";
import useColors from "@/hooks/useColors";
import { showPanel } from "../panels/usePanel";
import IconButton from "./iconButton";
import TrackPlayer from "@/core/trackPlayer";
import Toast from "@/utils/toast";
import Icon from "@/components/base/icon.tsx";
import MusicSheet, { useSheetIsStarred } from "@/core/musicSheet";
import { MusicRepeatMode } from "@/constants/repeatModeConst";
import { useI18N } from "@/core/i18n";

interface IProps {
    musicList: IMusic.IMusicItem[] | null;
    canStar?: boolean;
    musicSheet?: IMusic.IMusicSheetItem | null;
}
export default function (props: IProps) {
    const { musicList, canStar, musicSheet } = props;

    const sheetName = musicSheet?.title;
    const sheetId = musicSheet?.id;

    const colors = useColors();
    const navigate = useNavigate();
    const { t } = useI18N();

    const starred = useSheetIsStarred(musicSheet);

    return (
        <View style={style.topWrapper}>
            <Pressable
                style={style.playAll}
                onPress={() => {
                    if (musicList) {
                        let defaultPlayMusic = musicList[0];
                        if (
                            TrackPlayer.repeatMode ===
                            MusicRepeatMode.SHUFFLE
                        ) {
                            defaultPlayMusic =
                                musicList[
                                    Math.floor(Math.random() * musicList.length)
                                ];
                        }
                        TrackPlayer.playWithReplacePlayList(
                            defaultPlayMusic,
                            musicList,
                        );
                    }
                }}>
                <Icon
                    name="play-circle"
                    style={style.playAllIcon}
                    size={iconSizeConst.normal}
                    color={colors.text}
                />
                <ThemeText fontWeight="bold">{t("playAllBar.title")}</ThemeText>
            </Pressable>
            {canStar && musicSheet ? (
                <IconButton
                    name={starred ? "heart" : "heart-outline"}
                    sizeType={"normal"}
                    color={starred ? "#e31639" : undefined}
                    style={style.optionButton}
                    onPress={async () => {
                        if (!starred) {
                            MusicSheet.starMusicSheet(musicSheet);
                            Toast.success(t("toast.hasStarred"));
                        } else {
                            MusicSheet.unstarMusicSheet(musicSheet);
                            Toast.success(t("toast.hasUnstarred"));
                        }
                    }}
                />
            ) : null}
            <IconButton
                name="folder-plus"
                sizeType={"normal"}
                style={style.optionButton}
                onPress={async () => {
                    showPanel("AddToMusicSheet", {
                        musicItem: musicList ?? [],
                        newSheetDefaultName: sheetName,
                    });
                }}
            />
            <IconButton
                name="pencil-square"
                sizeType={"normal"}
                style={style.optionButton}
                onPress={async () => {
                    navigate(ROUTE_PATH.MUSIC_LIST_EDITOR, {
                        musicList: musicList,
                        musicSheet: {
                            title: sheetName,
                            id: sheetId,
                        },
                    });
                }}
            />
        </View>
    );
}

const style = StyleSheet.create({
    /** playall */
    topWrapper: {
        height: rpx(84),
        paddingHorizontal: rpx(24),
        flexDirection: "row",
        alignItems: "center",
    },
    playAll: {
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
    },
    playAllIcon: {
        marginRight: rpx(12),
    },
    optionButton: {
        marginLeft: rpx(36),
    },
});
