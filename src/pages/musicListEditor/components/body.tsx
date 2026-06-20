import React, { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import rpx from "@/utils/rpx";
import TextButton from "@/components/base/textButton.tsx";
import { useAtom } from "jotai";
import { editingMusicListAtom } from "../store/atom";
import MusicList from "./musicList";
import HorizontalSafeAreaView from "@/components/base/horizontalSafeAreaView.tsx";
import globalStyle from "@/constants/globalStyle";
import { useI18N } from "@/core/i18n";

export default function Body() {
    const { t } = useI18N();
    const [editingMusicList, setEditingMusicList] =
        useAtom(editingMusicListAtom);
    const selectedItems = useMemo(
        () => editingMusicList.filter(_ => _.checked),
        [editingMusicList],
    );
    return (
        <HorizontalSafeAreaView style={globalStyle.flex1}>
            <View style={style.header}>
                <TextButton
                    onPress={() => {
                        if (
                            selectedItems.length !== editingMusicList.length &&
                            editingMusicList.length
                        ) {
                            setEditingMusicList(
                                editingMusicList.map(_ => ({
                                    musicItem: _.musicItem,
                                    checked: true,
                                })),
                            );
                        } else {
                            setEditingMusicList(
                                editingMusicList.map(_ => ({
                                    musicItem: _.musicItem,
                                    checked: false,
                                })),
                            );
                        }
                    }}>
                    {`${((selectedItems.length !== editingMusicList.length &&
                        editingMusicList.length) || !editingMusicList.length)
                        ? t("common.selectAll")
                        : t("common.unselectAll")
                    } (${t("musicListEditor.selectMusicCount", { count: selectedItems.length })})`}
                </TextButton>
            </View>
            <MusicList />
        </HorizontalSafeAreaView>
    );
}

const style = StyleSheet.create({
    header: {
        flexDirection: "row",
        height: rpx(88),
        paddingHorizontal: rpx(24),
        alignItems: "center",
        justifyContent: "space-between",
    },
});
