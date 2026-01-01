import React, { useMemo } from "react";
import rpx from "@/utils/rpx";
import { ImgAsset } from "@/constants/assetsConst";
import FastImage from "@/components/base/fastImage";
import useOrientation from "@/hooks/useOrientation";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useCurrentMusic } from "@/core/trackPlayer";
import globalStyle from "@/constants/globalStyle";
import { View } from "react-native";
import Operations from "./operations";
import { showPanel } from "@/components/panels/usePanel.ts";
import MusicInfo from "./musicInfo";

export default function AlbumCover() {
    const musicItem = useCurrentMusic();
    const orientation = useOrientation();

    const artworkStyle = useMemo(() => {
        if (orientation === "vertical") {
            return {
                width: rpx(600),
                height: rpx(600),
                borderRadius: rpx(28),
            };
        } else {
            return {
                width: rpx(260),
                height: rpx(260),
                borderRadius: rpx(12),
            };
        }
    }, [orientation]);

    const longPress = Gesture.LongPress()
        .onStart(() => {
            if (musicItem?.artwork) {
                showPanel("ImageViewer", {
                    url: musicItem.artwork,
                });
            }
        })
        .runOnJS(true);

    return (
        <View style={globalStyle.fwflex1}>
            <GestureDetector gesture={longPress}>
                <View style={globalStyle.fullCenter}>
                    <FastImage
                        style={artworkStyle}
                        source={musicItem?.artwork}
                        placeholderSource={ImgAsset.albumDefault}
                    />
                </View>
            </GestureDetector>
            <MusicInfo />
            <Operations />
        </View>
    );
}
