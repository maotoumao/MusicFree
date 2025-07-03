import React from "react";
import TopListBody from "./components/topListBody";
import MusicBar from "@/components/musicBar";
import VerticalSafeAreaView from "@/components/base/verticalSafeAreaView";
import globalStyle from "@/constants/globalStyle";
import HorizontalSafeAreaView from "@/components/base/horizontalSafeAreaView.tsx";
import AppBar from "@/components/base/appBar";
import { useI18N } from "@/core/i18n";

export default function TopList() {
    const { t } = useI18N();

    return (
        <VerticalSafeAreaView style={globalStyle.fwflex1}>
            <AppBar withStatusBar>{t("topList.title")}</AppBar>
            <HorizontalSafeAreaView style={globalStyle.flex1}>
                <TopListBody />
            </HorizontalSafeAreaView>
            <MusicBar />
        </VerticalSafeAreaView>
    );
}
