import React from "react";
import NavBar from "./components/navBar";
import MusicBar from "@/components/musicBar";
import SheetMusicList from "./components/sheetMusicList";
import StatusBar from "@/components/base/statusBar";
import globalStyle from "@/constants/globalStyle";
import { SafeAreaView } from "react-native-safe-area-context";
import { StyleSheet } from "react-native";
import rpx from "@/utils/rpx";
import { useParams } from "@/core/router";
import { useSheetItem } from "@/core/musicSheet";
import Animated, { useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import LinearGradient from "react-native-linear-gradient";
import { PixelRatio } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import useDarkDominantColor from "@/hooks/useDarkDominantColor";

export default function SheetDetail() {
    const { id = "favorite" } = useParams<"local-sheet-detail">();
    const sheet = useSheetItem(id);
    const cover = sheet?.coverImg;
    const scrollY = useSharedValue(0);
    // 100dp 对应的像素值 (JS 线程预算, worklet 内不可调用 PixelRatio)
    const scrollThreshold = 100 * PixelRatio.get();
    const safeAreaInsets = useSafeAreaInsets();
    // 顶部黑色渐变遮罩: 未滚动完全透明, 滚动 100dp 后完全不透明
    const scrimStyle = useAnimatedStyle(() => ({
        opacity: Math.min(1, scrollY.value / scrollThreshold),
    }));
    const scrimHeight = safeAreaInsets.top + rpx(160);
    const bgColor = useDarkDominantColor(cover);

    return (
        <SafeAreaView
            edges={["bottom"]}
            style={[globalStyle.fwflex1, styles.pageBg, 
            // { backgroundColor: bgColor }
            ]}>
            <StatusBar backgroundColor={"transparent"} />
            <NavBar />
            <SheetMusicList scrollYShared={scrollY} />
            <MusicBar />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    pageBg: {
        backgroundColor: "#000000",
    },
    scrollScrim: {
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 90,
    },
});
