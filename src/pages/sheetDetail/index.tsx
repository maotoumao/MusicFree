import React from "react";
import NavBar from "./components/navBar";
import MusicBar from "@/components/musicBar";
import SheetMusicList from "./components/sheetMusicList";
import StatusBar from "@/components/base/statusBar";
import VerticalSafeAreaView from "@/components/base/verticalSafeAreaView";
import globalStyle from "@/constants/globalStyle";

export default function SheetDetail() {
    return (
        <VerticalSafeAreaView style={globalStyle.fwflex1}>
            <StatusBar />
            <NavBar />
            <SheetMusicList />
            <MusicBar />
        </VerticalSafeAreaView>
    );
}
