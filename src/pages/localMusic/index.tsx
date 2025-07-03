import React from "react";
import MainPage from "./mainPage";
import VerticalSafeAreaView from "@/components/base/verticalSafeAreaView";
import globalStyle from "@/constants/globalStyle";

export default function LocalMusic() {
    return (
        <VerticalSafeAreaView style={globalStyle.fwflex1}>
            <MainPage />
        </VerticalSafeAreaView>
    );
}
