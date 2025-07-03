import AppBar from "@/components/base/appBar";
import StatusBar from "@/components/base/statusBar";
import VerticalSafeAreaView from "@/components/base/verticalSafeAreaView";
import globalStyle from "@/constants/globalStyle";
import i18n from "@/core/i18n";
import { useParams } from "@/core/router";
import { useSetAtom } from "jotai";
import React, { useEffect } from "react";
import Body from "./components/body";
import Bottom from "./components/bottom";
import { editingMusicListAtom, musicListChangedAtom } from "./store/atom";

export default function MusicListEditor() {
    const { musicSheet, musicList } = useParams<"music-list-editor">();

    const setEditingMusicList = useSetAtom(editingMusicListAtom);
    const setMusicListChanged = useSetAtom(musicListChangedAtom);

    useEffect(() => {
        setEditingMusicList(
            (musicList ?? []).map(_ => ({ musicItem: _, checked: false })),
        );
        return () => {
            setEditingMusicList([]);
            setMusicListChanged(false);
        };
    }, []);

    return (
        <VerticalSafeAreaView style={globalStyle.fwflex1}>
            <StatusBar />
            <AppBar>{musicSheet?.title ?? i18n.t("common.sheet")}</AppBar>
            <Body />
            <Bottom />
        </VerticalSafeAreaView>
    );
}
