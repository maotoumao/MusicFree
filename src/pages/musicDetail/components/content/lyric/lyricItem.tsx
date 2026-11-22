import React, { memo } from "react";
import { StyleSheet, Text, View } from "react-native";
import rpx from "@/utils/rpx";
import { fontSizeConst } from "@/constants/uiConst";

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

    // 渐进模糊: 当前行完全清晰; 越远的行模糊越大 (2 → 100px)、越暗
    const d = highlight ? 1 : distance ?? 6;
    const blurPx = highlight ? 0 : Math.min(2 + (d - 1) * 24, 100);
    const opacity = highlight
        ? 1
        : light
            ? 0.9
            : Math.max(0.2, 0.6 - (d - 1) * 0.1);

    return (
        <View
            onLayout={({ nativeEvent }) => {
                if (index !== undefined) {
                    onLayout?.(index, nativeEvent.layout.height);
                }
            }}
            style={[
                lyricStyles.item,
                highlight
                    ? null
                    : {
                        opacity,
                        filter: [{ blur: blurPx }],
                    },
            ]}>
            <Text
                style={[
                    lyricStyles.text,
                    {
                        fontSize: fontSize || fontSizeConst.content,
                    },
                    light ? lyricStyles.draggingText : null,
                ]}>
                {text}
            </Text>
        </View>
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
    text: {
        color: "white",
        textAlign: "left",
        textAlignVertical: "center",
    },
    highlightText: {
        color: "white",
    },
    draggingText: {
        color: "#ea419e",
    },
});
