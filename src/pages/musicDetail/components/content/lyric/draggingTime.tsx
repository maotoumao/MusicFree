import React from "react";
import { StyleSheet, Text } from "react-native";
import rpx from "@/utils/rpx";
import timeformat from "@/utils/timeformat";
import { fontSizeConst } from "@/constants/uiConst";
import { useProgress } from "@/core/trackPlayer";

export default function DraggingTime(props: { time: number }) {
    const progress = useProgress();

    return (
        <Text style={style.draggingTimeText}>
            {timeformat(
                Math.max(Math.min(props.time, progress.duration ?? 0), 0),
            )}
        </Text>
    );
}

const style = StyleSheet.create({
    draggingTimeText: {
        color: "#dddddd",
        paddingHorizontal: rpx(8),
        paddingVertical: rpx(6),
        borderRadius: rpx(12),
        backgroundColor: "rgba(255,255,255,0.1)",
        fontSize: fontSizeConst.description,
    },
});
