import React from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, View } from "react-native";
import rpx from "@/utils/rpx";
import SeekBar from "./seekBar";
import PlayControl from "./playControl";
import ExtraControls from "./extraControls";
import useOrientation from "@/hooks/useOrientation";

export default function Bottom() {
    const orientation = useOrientation();
    const safeAreaInsets = useSafeAreaInsets();
    const isLandscape = orientation === "horizontal";
    return (
        <View
            style={[
                style.wrapper,
                isLandscape
                    ? {
                        height: rpx(190),
                    }
                    : { paddingBottom: safeAreaInsets.bottom },
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
        height: rpx(400),
    },
});
