import React, { useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import rpx from "@/utils/rpx";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { useNavigate } from "@/core/router";
import IconButton from "@/components/base/iconButton";
import MusicSheet, { useSheetIsStarred } from "@/core/musicSheet";
import Toast from "@/utils/toast";
import { useI18N } from "@/core/i18n";
import { ROUTE_PATH } from "@/core/router";

interface INavBarProps {
    navTitle: string;
    musicList: IMusic.IMusicItem[];
    sheetInfo: IMusic.IMusicSheetItem | null;
    canStar?: boolean;
}

export default function (props: INavBarProps) {
    const navigation = useNavigation();
    const navigate = useNavigate();
    const { t } = useI18N();
    const { navTitle, musicList, sheetInfo, canStar } = props;
    const safeAreaInsets = useSafeAreaInsets();
    const [showMenu, setShowMenu] = useState(false);
    const starred = useSheetIsStarred(sheetInfo);

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
                    navigate(ROUTE_PATH.SEARCH_MUSIC_LIST, {
                        musicList: musicList,
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
                    <TouchableOpacity
                        style={styles.menuItem}
                        onPress={() => {
                            setShowMenu(false);
                            navigate(ROUTE_PATH.SEARCH_MUSIC_LIST, {
                                musicList: musicList,
                            });
                        }}>
                        <Text style={styles.menuItemText}>
                            {"搜索本歌单"}
                        </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={styles.menuItem}
                        onPress={() => {
                            setShowMenu(false);
                            navigate(ROUTE_PATH.MUSIC_LIST_EDITOR, {
                                musicList: musicList,
                                musicSheet: {
                                    title: navTitle,
                                    id: sheetInfo?.id,
                                },
                            });
                        }}>
                        <Text style={styles.menuItemText}>批量编辑</Text>
                    </TouchableOpacity>
                    {canStar && sheetInfo ? (
                        <TouchableOpacity
                            style={styles.menuItem}
                            onPress={() => {
                                setShowMenu(false);
                                if (starred) {
                                    MusicSheet.unstarMusicSheet(sheetInfo);
                                    Toast.success(t("toast.hasUnstarred"));
                                } else {
                                    MusicSheet.starMusicSheet(sheetInfo);
                                    Toast.success(t("toast.hasStarred"));
                                }
                            }}>
                            <Text style={styles.menuItemText}>
                                {starred
                                    ? t("toast.hasUnstarred")
                                    : t("toast.hasStarred")}
                            </Text>
                        </TouchableOpacity>
                    ) : null}
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
