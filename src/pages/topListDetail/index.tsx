import MusicSheetPage from "@/components/musicSheetPage";
import { useI18N } from "@/core/i18n";
import { useParams } from "@/core/router";
import React from "react";
import useTopListDetail from "./hooks/useTopListDetail";

export default function TopListDetail() {
    const { pluginHash, topList } = useParams<"top-list-detail">();
    const [topListDetail, state, loadMore] = useTopListDetail(
        topList,
        pluginHash,
    );
    const { t } = useI18N();

    return (
        <MusicSheetPage
            navTitle={t("topList.title")}
            sheetInfo={topListDetail}
            state={state}
            onLoadMore={loadMore}
            onRetry={loadMore}
        />
    );
}
