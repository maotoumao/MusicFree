import React from "react";
import MusicSheetPage from "@/components/musicSheetPage";
import { useParams } from "@/core/router";
import usePluginSheetMusicList from "./hooks/usePluginSheetMusicList";
import i18n from "@/core/i18n";

export default function PluginSheetDetail() {
    const { sheetInfo } = useParams<"plugin-sheet-detail">();

    const [requestState, sheetItem, musicList, getSheetDetail] =
        usePluginSheetMusicList(sheetInfo as IMusic.IMusicSheetItem);
    return (
        <MusicSheetPage
            canStar
            sheetInfo={sheetItem}
            navTitle={sheetInfo?.title ?? i18n.t("common.sheet")}
            musicList={musicList}
            state={requestState}
            onRetry={getSheetDetail}
            onLoadMore={getSheetDetail}
        />
    );
}
