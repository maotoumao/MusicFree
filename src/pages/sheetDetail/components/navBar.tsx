import React, { useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import rpx from "@/utils/rpx";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import IconButton from "@/components/base/iconButton";
import { showDialog } from "@/components/dialogs/useDialog";
import { showPanel } from "@/components/panels/usePanel.ts";
import { SortType } from "@/constants/commonConst.ts";
import { useI18N } from "@/core/i18n";
import MusicSheet, { useSheetItem } from "@/core/musicSheet";
import { ROUTE_PATH, useParams } from "@/core/router";
import { default as Toast, default as toast } from "@/utils/toast";

export default function () {
    const navigation = useNavigation<any>();
    const { id = "favorite" } = useParams<"local-sheet-detail">();
    const musicSheet = useSheetItem(id);
    const { t } = useI18N();
    const safeAreaInsets = useSafeAreaInsets();
    const [showMenu, setShowMenu] = useState(false);

    const menuOptions = [
        {
            icon: "pencil-outline",
            title: t("sheetDetail.editSheetInfo"),
            onPress() {
                setShowMenu(false);
                showPanel("EditMusicSheetInfo", {
                    musicSheet: musicSheet,
                });
            },
        },
        {
            icon: "pencil-square",
            title: t("sheetDetail.batchEditMusic"),
            onPress() {
                setShowMenu(false);
                navigation.navigate(ROUTE_PATH.MUSIC_LIST_EDITOR, {
                    musicList: musicSheet.musicList,
                    musicSheet: musicSheet,
                });
            },
        },
        {
            icon: "sort-outline",
            title: t("sheetDetail.sortMusic"),
            onPress() {
                setShowMenu(false);
                showDialog("RadioDialog", {
                    content: [
                        {
                            value: SortType.Title,
                            label: t("sheetDetail.sortMusicOption.byTitle"),
                        },
                        {
                            value: SortType.Artist,
                            label: t("sheetDetail.sortMusicOption.byArtist"),
                        },
                        {
                            value: SortType.Album,
                            label: t("sheetDetail.sortMusicOption.byAlbum"),
                        },
                        {
                            value: SortType.Newest,
                            label: t("sheetDetail.sortMusicOption.newest"),
                        },
                        {
                            value: SortType.Oldest,
                            label: t("sheetDetail.sortMusicOption.oldest"),
                        },
                    ],
                    defaultSelected:
                        MusicSheet.getSheetMeta(id, "sort") ||
                        SortType.None,
                    title: t("sheetDetail.sortMusic"),
                    async onOk(value) {
                        await MusicSheet.setSortType(
                            id,
                            value as SortType,
                        );
                        toast.success(t("toast.sortHasBeenUpdated"));
                    },
                });
            },
        },
        {
            icon: "trash-outline",
            title: t("sheetDetail.deleteSheet"),
            show: id !== "favorite",
            onPress() {
                setShowMenu(false);
                showDialog("SimpleDialog", {
                    title: t("sheetDetail.deleteSheet"),
                    content: t("sheetDetail.deleteSheetContent", {
                        name: musicSheet.title,
                    }),
                    onOk: async () => {
                        await MusicSheet.removeSheet(id);
                        Toast.success(t("toast.deleteSuccess"));
                        navigation.goBack();
                    },
                });
            },
        },
    ];

    return (
        <View
            style={[
                styles.wrapper,
                {
                    paddingTop: safeAreaInsets.top,
                },
            ]}
            pointerEvents="box-none">
            <IconButton
                name="arrow-left"
                sizeType="normal"
                color="white"
                onPress={() => {
                    navigation.goBack();
                }}
            />
            <View style={styles.grow} />
            <IconButton
                name="magnifying-glass"
                sizeType="normal"
                color="white"
                onPress={() => {
                    navigation.navigate(ROUTE_PATH.SEARCH_MUSIC_LIST, {
                        musicList: musicSheet?.musicList,
                        musicSheet: musicSheet,
                    });
                }}
            />
            <IconButton
                name="ellipsis-vertical"
                sizeType="normal"
                color="white"
                style={styles.moreButton}
                onPress={() => {
                    setShowMenu(v => !v);
                }}
            />
            {showMenu ? (
                <View
                    style={[
                        styles.menuPanel,
                        {
                            top: safeAreaInsets.top + rpx(80),
                        },
                    ]}>
                    {menuOptions.map(option =>
                        option.show === false ? null : (
                            <TouchableOpacity
                                key={option.title}
                                style={styles.menuItem}
                                onPress={option.onPress}>
                                <Text style={styles.menuItemText}>
                                    {option.title}
                                </Text>
                            </TouchableOpacity>
                        ),
                    )}
                </View>
            ) : null}
        </View>
    );
}

const styles = StyleSheet.create({
    wrapper: {
        position: "absolute",
        left: 0,
        right: 0,
        top: 0,
        zIndex: 100,
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: rpx(16),
        height: rpx(160),
    },
    grow: {
        flex: 1,
    },
    moreButton: {
        marginLeft: rpx(8),
    },
    menuPanel: {
        position: "absolute",
        right: rpx(16),
        width: rpx(320),
        borderRadius: rpx(16),
        backgroundColor: "#2C2C2E",
        paddingVertical: rpx(8),
        elevation: 12,
        shadowColor: "#000",
        shadowOpacity: 0.4,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 4 },
    },
    menuItem: {
        height: rpx(88),
        justifyContent: "center",
        paddingHorizontal: rpx(28),
    },
    menuItemText: {
        color: "white",
        fontSize: rpx(28),
        includeFontPadding: false,
    },
});
