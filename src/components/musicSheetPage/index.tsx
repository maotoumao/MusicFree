import React from "react";
import NavBar from "./components/navBar";
import MusicBar from "@/components/musicBar";
import SheetMusicList from "./components/sheetMusicList";
import StatusBar from "@/components/base/statusBar";
import globalStyle from "@/constants/globalStyle";
import { SafeAreaView } from "react-native-safe-area-context";
import { StyleSheet } from "react-native";
import { RequestStateCode } from "@/constants/commonConst";
import useDarkDominantColor from "@/hooks/useDarkDominantColor";

interface IMusicSheetPageProps {
    navTitle: string;
    sheetInfo: ICommon.WithMusicList<IMusic.IMusicSheetItemBase> | null;
    musicList?: IMusic.IMusicItem[] | null;
    // 是否可收藏
    canStar?: boolean;
    // 状态
    state: RequestStateCode;
    onRetry?: () => void;
    onLoadMore?: () => void;
}

export default function MusicSheetPage(props: IMusicSheetPageProps) {
    const { navTitle, sheetInfo, musicList, canStar, onLoadMore, onRetry, state } =
        props;

    const cover = sheetInfo?.artwork ?? sheetInfo?.coverImg;
    const bgColor = useDarkDominantColor(cover);

    return (
        <SafeAreaView
            edges={["bottom"]}
            style={[globalStyle.fwflex1, styles.pageBg, styles.debugMark]}>
            <StatusBar />
            <NavBar
                musicList={musicList ?? sheetInfo?.musicList ?? []}
                navTitle={navTitle}
                sheetInfo={sheetInfo as any}
                canStar={canStar}
            />
            <SheetMusicList
                navTitle={navTitle}
                sheetInfo={sheetInfo as any}
                musicList={musicList ?? sheetInfo?.musicList}
                state={state}
                onRetry={onRetry}
                onLoadMore={onLoadMore}
            />
            <MusicBar />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    pageBg: {
        backgroundColor: "#000000",
    },
    debugMark: {
        borderWidth: 6,
        borderColor: "red",
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
