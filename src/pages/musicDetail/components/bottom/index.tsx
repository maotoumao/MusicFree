import React from "react";
import { StyleSheet, View } from "react-native";
import rpx from "@/utils/rpx";
import SeekBar from "./seekBar";
import PlayControl from "./playControl";
import ExtraControls from "./extraControls";
import useOrientation from "@/hooks/useOrientation";

export default function Bottom() {
    const orientation = useOrientation();
    const isLandscape = orientation === "horizontal";
    return (
        <View
            style={[
                style.wrapper,
                isLandscape
                    ? {
                        height: rpx(156),
                    }
                    : undefined,
            ]}>
            <SeekBar />
            <PlayControl />
            {isLandscape ? null : <ExtraControls />}
        </View>
    );
}

const style = StyleSheet.create({
    wrapper: {
        width: "100%",
        height: rpx(328),
    },
});
