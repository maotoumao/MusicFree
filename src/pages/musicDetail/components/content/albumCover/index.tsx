import React, { useMemo } from "react";
import rpx from "@/utils/rpx";
import { ImgAsset } from "@/constants/assetsConst";
import FastImage from "@/components/base/fastImage";
import useOrientation from "@/hooks/useOrientation";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useCurrentMusic } from "@/core/trackPlayer";
import globalStyle from "@/constants/globalStyle";
import { StyleSheet, View } from "react-native";
import { showPanel } from "@/components/panels/usePanel.ts";
import LyricPreview from "./lyricPreview";

interface IProps {
    onTurnPageClick?: () => void;
}

export default function AlbumCover(props: IProps) {
    const { onTurnPageClick } = props;

    const musicItem = useCurrentMusic();
    const orientation = useOrientation();

    const artworkStyle = useMemo(() => {
        if (orientation === "vertical") {
            return {
                width: rpx(646),
                height: rpx(646),
                borderRadius: rpx(16),
            };
        } else {
            return {
                width: rpx(160),
                height: rpx(160),
                borderRadius: rpx(16),
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

    const tap = Gesture.Tap()
        .onStart(() => {
            onTurnPageClick?.();
        })
        .runOnJS(true);

    const combineGesture = Gesture.Race(tap, longPress);

    return (
        <>
            <GestureDetector gesture={combineGesture}>
                <View style={styles.artworkContainer}>
                    <FastImage
                        style={artworkStyle}
                        source={musicItem?.artwork}
                        placeholderSource={ImgAsset.albumDefault}
                    />
                </View>
            </GestureDetector>
            {orientation === "vertical" ? (
                <LyricPreview onPress={onTurnPageClick} />
            ) : null}
        </>
    );
}

const styles = StyleSheet.create({
    artworkContainer: {
        ...globalStyle.fullCenter,
        shadowColor: "#000",
        shadowOffset: {
            width: 0,
            height: 10,
        },
        shadowOpacity: 0.55,
        shadowRadius: 18,
        elevation: 16,
    },
});
