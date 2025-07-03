import Icon, { IIconName } from "@/components/base/icon.tsx";
import ThemeText from "@/components/base/themeText";
import { showPanel } from "@/components/panels/usePanel";
import { iconSizeConst } from "@/constants/uiConst";
import downloader from "@/core/downloader";
import { useI18N } from "@/core/i18n";
import { useParams } from "@/core/router";
import TrackPlayer from "@/core/trackPlayer";
import useColors from "@/hooks/useColors";
import rpx from "@/utils/rpx";
import Toast from "@/utils/toast";
import { produce } from "immer";
import { useAtom, useSetAtom } from "jotai";
import React, { useMemo } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { editingMusicListAtom, musicListChangedAtom } from "../store/atom";

export default function Bottom() {
    const { musicSheet } = useParams<"music-list-editor">();
    const [editingMusicList, setEditingMusicList] =
        useAtom(editingMusicListAtom);
    const setMusicListChanged = useSetAtom(musicListChangedAtom);
    const { t } = useI18N();

    const selectedEditorItems = useMemo(
        () => editingMusicList.filter(_ => _.checked),
        [editingMusicList],
    );

    const selectedItems = useMemo(
        () => selectedEditorItems.map(_ => _.musicItem),
        [selectedEditorItems],
    );

    function resetSelectedIndices() {
        setEditingMusicList(
            editingMusicList.map(_ => ({
                musicItem: _.musicItem,
                checked: false,
            })),
        );
    }

    return (
        <View style={style.wrapper}>
            <BottomIcon
                icon="motion-play"
                title={t("musicListEditor.addToNextPlay")}
                onPress={async () => {
                    TrackPlayer.addNext(selectedItems);
                    resetSelectedIndices();
                    Toast.success(t("toast.addToNextPlay"));
                }}
            />
            <BottomIcon
                icon="folder-plus"
                title={t("musicListEditor.addToSheet")}
                onPress={() => {
                    if (selectedItems.length) {
                        showPanel("AddToMusicSheet", {
                            musicItem: selectedItems,
                        });
                        resetSelectedIndices();
                    }
                }}
            />
            <BottomIcon
                icon="arrow-down-tray"
                title={t("common.download")}
                onPress={() => {
                    if (selectedItems.length) {
                        downloader.download(selectedItems);
                        Toast.success(
                            t("toast.beginDownload"),
                        );
                        resetSelectedIndices();
                    }
                }}
            />
            <BottomIcon
                icon="trash-outline"
                title={t("common.delete")}
                color={
                    selectedItems.length && musicSheet?.id
                        ? "text"
                        : "textSecondary"
                }
                onPress={() => {
                    if (selectedItems.length && musicSheet?.id) {
                        setEditingMusicList(
                            produce(prev => prev.filter(_ => !_.checked)),
                        );
                        setMusicListChanged(true);
                        Toast.warn(t("toast.rememberToSave"));
                    }
                }}
            />
        </View>
    );
}

interface IBottomIconProps {
    icon: IIconName;
    title: string;
    color?: "text" | "textSecondary";
    onPress: () => void;
}
function BottomIcon(props: IBottomIconProps) {
    const { icon, title, onPress, color = "text" } = props;
    const colors = useColors();
    return (
        <Pressable
            onPress={onPress}
            style={[style.bottomIconWrapper, { backgroundColor: colors.appBar }]}>
            <Icon
                name={icon}
                color={colors.appBarText}
                style={color === "textSecondary" ? style.opacity_06 : undefined}
                size={iconSizeConst.big}
                onPress={onPress}
            />
            <ThemeText
                fontSize="subTitle"
                fontColor={"appBarText"}
                opacity={color === "textSecondary" ? 0.6 : undefined}
                style={style.bottomIconText}>
                {title}
            </ThemeText>
        </Pressable>
    );
}

const style = StyleSheet.create({
    wrapper: {
        width: "100%",
        height: rpx(144),
        flexDirection: "row",
    },

    bottomIconWrapper: {
        flex: 1,
        height: "100%",
        alignItems: "center",
        justifyContent: "center",
    },
    bottomIconText: {
        marginTop: rpx(12),
    },
    opacity_06: {
        opacity: 0.6,
    },
});
