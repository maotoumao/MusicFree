import React from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import rpx from "@/utils/rpx";
import { StyleSheet, View } from "react-native";
import SeekBar from "./seekBar";
import PlayControl from "./playControl";
import ExtraControls from "./extraControls";

export default function Bottom() {
    const safeAreaInsets = useSafeAreaInsets();
    return (
        <View style={[style.wrapper, { paddingBottom: safeAreaInsets.bottom }]}>
            <SeekBar />
            <PlayControl />
            <ExtraControls />
        </View>
    );
}

const style = StyleSheet.create({
    wrapper: {
        width: "100%",
        height: rpx(400),
    },
});
