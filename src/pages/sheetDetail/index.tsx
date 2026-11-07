import React from "react";
import NavBar from "./components/navBar";
import MusicBar from "@/components/musicBar";
import SheetMusicList from "./components/sheetMusicList";
import StatusBar from "@/components/base/statusBar";
import globalStyle from "@/constants/globalStyle";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image, StyleSheet } from "react-native";
import { useParams } from "@/core/router";
import { useSheetItem } from "@/core/musicSheet";

export default function SheetDetail() {
    const { id = "favorite" } = useParams<"local-sheet-detail">();
    const sheet = useSheetItem(id);
    const cover = sheet?.coverImg;

    return (
        <SafeAreaView
            edges={["bottom"]}
            style={[globalStyle.fwflex1, styles.pageBg]}>
            {/* 封面模糊氛围背景 */}
            {cover ? (
                <Image
                    blurRadius={40}
                    source={typeof cover === "string" ? { uri: cover } : cover}
                    style={styles.artworkBg}
                />
            ) : null}
            <StatusBar />
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
    artworkBg: {
        position: "absolute",
        width: "100%",
        height: "100%",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        opacity: 0.25,
    },
});
