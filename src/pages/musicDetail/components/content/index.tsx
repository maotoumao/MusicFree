import React, { useRef, useEffect } from "react";
import { View } from "react-native";
import PagerView from "react-native-pager-view";
import AlbumCover from "./albumCover";
import Lyric from "./lyric";
import useOrientation from "@/hooks/useOrientation";
import globalStyle from "@/constants/globalStyle";

interface IProps {
    pageIndex: number;
    onPageSelected: (index: number) => void;
}

export default function Content({ pageIndex, onPageSelected }: IProps) {
    const orientation = useOrientation();
    const pagerRef = useRef<PagerView>(null);

    useEffect(() => {
        if (orientation !== "horizontal") {
            pagerRef.current?.setPage(pageIndex);
        }
    }, [pageIndex, orientation]);

    if (orientation === "horizontal") {
        return (
            <View style={globalStyle.fwflex1}>
                <AlbumCover />
            </View>
        );
    }

    return (
        <PagerView
            style={globalStyle.fwflex1}
            initialPage={pageIndex}
            onPageSelected={(e) => onPageSelected(e.nativeEvent.position)}
            ref={pagerRef}
        >
            <View key="album" style={globalStyle.fwflex1}>
                <AlbumCover />
            </View>
            <View key="lyric" style={globalStyle.fwflex1}>
                <Lyric />
            </View>
        </PagerView>
    );
}
