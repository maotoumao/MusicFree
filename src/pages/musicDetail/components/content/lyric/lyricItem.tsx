import React, { memo, useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withSpring,
} from "react-native-reanimated";
import rpx from "@/utils/rpx";
import BlurLyricText from "@/components/base/blurLyricText.tsx";
import { fontSizeConst } from "@/constants/uiConst";
import { useAppConfig } from "@/core/appConfig";

interface ILyricItemComponentProps {
    // 行号
    index?: number;
    // 显示
    light?: boolean;
    // 高亮 (当前播放行)
    highlight?: boolean;
    // 距当前播放行的行数, 越大越模糊越暗
    distance?: number;
    // 文本
    text?: string;
    // 字体大小
    fontSize?: number;

    onLayout?: (index: number, height: number) => void;
}

function _LyricItemComponent(props: ILyricItemComponentProps) {
    const { light, highlight, text, onLayout, index, fontSize, distance } =
        props;
    const blurEnabled = useAppConfig("basic.lyricBlur") ?? true;

    // 渐进模糊: 当前行完全清晰 (完整换行); 非当前行为固定高度模糊单行,
    // 越远的行模糊半径越大 (2 → 40dp)、越暗
    // 渐进模糊：当前行清晰，距离越远模糊越明显，最远行达到 20
    const d = highlight ? 0 : distance ?? 1;
    const blurRadius = highlight ? 0 : Math.min(1 + Math.pow(d - 1, 1.5) * 1.5, 20);
    const alpha = highlight
        ? 1
        : light
            ? 0.9
            : Math.max(0.3, 0.75 - d * 0.08);
    const color = light
        ? "#ea419e"
        : highlight
            ? "white"
            : "white";
    // 行切换时整行透明度弹簧过渡 (避免直接闪切)
    const targetOpacity = highlight ? 1 : light ? 0.9 : Math.max(0.3, 0.75 - d * 0.08);
    const opacitySV = useSharedValue(targetOpacity);
    useEffect(() => {
        opacitySV.value = withSpring(targetOpacity, {
            damping: 18,
            stiffness: 160,
            mass: 0.8,
        });
    }, [targetOpacity]);
    const animStyle = useAnimatedStyle(() => ({
        opacity: opacitySV.value,
    }));

    return (
        <Animated.View
            onLayout={({ nativeEvent }) => {
                if (index !== undefined) {
                    onLayout?.(index, nativeEvent.layout.height);
                }
            }}
            style={[lyricStyles.item, animStyle]}>
            {highlight ? (
                <Text
                    style={[
                        lyricStyles.highlightText,
                        {
                            fontSize: fontSize || fontSizeConst.content,
                        },
                    ]}>
                    {text}
                </Text>
            ) : blurEnabled ? (
                <BlurLyricText
                    text={text}
                    fontSize={fontSize || fontSizeConst.content}
                    color={color}
                    blurRadius={blurRadius}
                    style={{ height: rpx(56) }}
                />
            ) : (
                <Text
                    style={[
                        lyricStyles.plainText,
                        {
                            fontSize: fontSize || fontSizeConst.content,
                        },
                    ]}>
                    {text}
                </Text>
            )}
        </Animated.View>
    );
}
// 歌词
const LyricItemComponent = memo(
    _LyricItemComponent,
    (prev, curr) =>
        prev.light === curr.light &&
        prev.highlight === curr.highlight &&
        prev.distance === curr.distance &&
        prev.text === curr.text &&
        prev.index === curr.index &&
        prev.fontSize === curr.fontSize,
);

export default LyricItemComponent;

const lyricStyles = StyleSheet.create({
    item: {
        width: "100%",
        paddingHorizontal: rpx(52),
        paddingVertical: rpx(24),
    },
    highlightText: {
        color: "white",
        fontWeight: "bold",
        textAlign: "left",
    },
    plainText: {
        color: "white",
        textAlign: "left",
        textAlignVertical: "center",
    },
    dimText: {
        textAlign: "left",
    },
});
