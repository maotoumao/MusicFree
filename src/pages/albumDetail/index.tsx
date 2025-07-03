import React from "react";
import useAlbumDetail from "./hooks/useAlbumMusicList";
import { useParams } from "@/core/router";
import MusicSheetPage from "@/components/musicSheetPage";
import { useI18N } from "@/core/i18n";

export default function AlbumDetail() {
    const { albumItem: originalAlbumItem } = useParams<"album-detail">();
    const [requestStateCode, albumItem, musicList, getAlbumDetail] =
        useAlbumDetail(originalAlbumItem);
    const { t } = useI18N();

    return (
        <MusicSheetPage
            navTitle={t("common.sheet")}
            sheetInfo={albumItem}
            state={requestStateCode}
            onRetry={getAlbumDetail}
            onLoadMore={getAlbumDetail}
            musicList={musicList}
        />
    );
}
