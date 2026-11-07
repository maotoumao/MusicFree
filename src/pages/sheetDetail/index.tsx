import React from "react";
import NavBar from "./components/navBar";
import MusicBar from "@/components/musicBar";
import SheetMusicList from "./components/sheetMusicList";
import StatusBar from "@/components/base/statusBar";
import globalStyle from "@/constants/globalStyle";
import { SafeAreaView } from "react-native-safe-area-context";
import { StyleSheet } from "react-native";
import { useParams } from "@/core/router";
import { useSheetItem } from "@/core/musicSheet";
import useDarkDominantColor from "@/hooks/useDarkDominantColor";

export default function SheetDetail() {
    const { id = "favorite" } = useParams<"local-sheet-detail">();
    const sheet = useSheetItem(id);
    const cover = sheet?.coverImg;
    const bgColor = useDarkDominantColor(cover);

    return (
        <SafeAreaView
            edges={["bottom"]}
            style={[globalStyle.fwflex1, styles.pageBg, 
            // { backgroundColor: bgColor }
            ]}>
            <StatusBar backgroundColor={"transparent"} />
            <NavBar />
            <SheetMusicList />
            <MusicBar />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    pageBg: {
        backgroundColor: "#000000",
    },
});
