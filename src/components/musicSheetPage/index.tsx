import React from "react";
import NavBar from "./components/navBar";
import MusicBar from "@/components/musicBar";
import SheetMusicList from "./components/sheetMusicList";
import StatusBar from "@/components/base/statusBar";
import globalStyle from "@/constants/globalStyle";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { PixelRatio, StyleSheet } from "react-native";
import rpx from "@/utils/rpx";
import Animated, { useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import LinearGradient from "react-native-linear-gradient";
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
    const scrollY = useSharedValue(0);
    // 100dp 对应的像素值 (JS 线程预算, worklet 内不可调用 PixelRatio)
    const scrollThreshold = 100 * PixelRatio.get();
    const safeAreaInsets = useSafeAreaInsets();
    // 顶部黑色渐变遮罩: 未滚动完全透明, 滚动 100dp 后完全不透明
    const scrimStyle = useAnimatedStyle(() => ({
        opacity: Math.min(1, scrollY.value / scrollThreshold),
    }));
    const scrimHeight = safeAreaInsets.top + rpx(160);

    return (
        <SafeAreaView
            edges={["bottom"]}
            style={[globalStyle.fwflex1, styles.pageBg]}>
            <StatusBar backgroundColor={"transparent"} />
            <NavBar
                musicList={musicList ?? sheetInfo?.musicList ?? []}
                navTitle={navTitle}
                sheetInfo={sheetInfo as any}
                canStar={canStar}
            />
            {/* 滚动渐显的顶部黑色渐变 */}
            <Animated.View
                pointerEvents="none"
                style={[styles.scrollScrim, { height: scrimHeight }, scrimStyle]}>
                <LinearGradient
                    style={StyleSheet.absoluteFill}
                    colors={["#000000", "rgba(0,0,0,0)"]}
                />
            </Animated.View>
            <SheetMusicList
                scrollYShared={scrollY}
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
    scrollScrim: {
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 90,
    },
});
