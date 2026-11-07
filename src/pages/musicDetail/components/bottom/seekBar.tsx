import React, { useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import rpx from "@/utils/rpx";
import Slider from "@react-native-community/slider";
import timeformat from "@/utils/timeformat";
import { fontSizeConst } from "@/constants/uiConst";
import TrackPlayer, { useProgress } from "@/core/trackPlayer";

interface ITimeLabelProps {
    time: number;
    /** 显示为剩余时间（前面加负号） */
    remaining?: boolean;
}

function TimeLabel(props: ITimeLabelProps) {
    const { time, remaining } = props;
    return (
        <Text style={style.text}>
            {remaining ? "-" : ""}
            {timeformat(Math.max(time, 0))}
        </Text>
    );
}

export default function SeekBar() {
    const progress = useProgress(1000);
    const [tmpProgress, setTmpProgress] = useState<number | null>(null);
    const slidingRef = useRef(false);

    const currentTime = tmpProgress ?? progress.position;

    return (
        <View style={style.wrapper}>
            <TimeLabel time={currentTime} />
            <Slider
                style={style.slider}
                minimumTrackTintColor={"#ffffff"}
                maximumTrackTintColor={"rgba(255,255,255,0.3)"}
                thumbTintColor={"#ffffff"}
                minimumValue={0}
                maximumValue={progress.duration}
                onSlidingStart={() => {
                    slidingRef.current = true;
                }}
                onValueChange={val => {
                    if (slidingRef.current) {
                        setTmpProgress(val);
                    }
                }}
                onSlidingComplete={val => {
                    slidingRef.current = false;
                    setTmpProgress(null);
                    if (val >= progress.duration - 2) {
                        val = progress.duration - 2;
                    }
                    TrackPlayer.seekTo(val);
                }}
                value={progress.position}
            />
            <TimeLabel
                time={progress.duration - currentTime}
                remaining
            />
        </View>
    );
}

const style = StyleSheet.create({
    wrapper: {
        width: "100%",
        height: rpx(40),
        justifyContent: "center",
        alignItems: "center",
        flexDirection: "row",
        paddingHorizontal: rpx(32),
    },
    slider: {
        flex: 1,
        marginHorizontal: rpx(16),
        height: rpx(40),
    },
    text: {
        fontSize: fontSizeConst.tag,
        includeFontPadding: false,
        color: "rgba(255,255,255,0.6)",
        minWidth: rpx(72),
        textAlign: "center",
    },
});
