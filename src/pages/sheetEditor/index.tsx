import React from "react";
import StatusBar from "@/components/base/statusBar";
import VerticalSafeAreaView from "@/components/base/verticalSafeAreaView";
import globalStyle from "@/constants/globalStyle";
import NavBar from "./components/navBar";
import Bottom from "./components/bottom";
import SheetList from "./components/sheetList";
import Business from "./components/business";

export default function SheetEditor() {

    return (
        <VerticalSafeAreaView style={globalStyle.fwflex1}>
            <Business />
            <StatusBar />
            <NavBar />
            <SheetList />
            <Bottom />
        </VerticalSafeAreaView>
    );
}
