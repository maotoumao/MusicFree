import React, { memo } from "react";
import { StyleSheet, Text } from "react-native";
import rpx from "@/utils/rpx";
import { fontSizeConst } from "@/constants/uiConst";

interface ILyricItemComponentProps {
    // 行号
    index?: number;
    // 显示
    light?: boolean;
    // 高亮
    highlight?: boolean;
    // 文本
    text?: string;
    // 字体大小
    fontSize?: number;

    onLayout?: (index: number, height: number) => void;
}

function _LyricItemComponent(props: ILyricItemComponentProps) {
    const { light, highlight, text, onLayout, index, fontSize } = props;

    return (
        <Text
            onLayout={({ nativeEvent }) => {
                if (index !== undefined) {
                    onLayout?.(index, nativeEvent.layout.height);
                }
            }}
            style={[
                lyricStyles.item,
                {
                    fontSize: fontSize || fontSizeConst.content,
                },
                highlight ? lyricStyles.highlightItem : null,
                light ? lyricStyles.draggingItem : null,
            ]}>
            {text}
        </Text>
    );
}
// 歌词
const LyricItemComponent = memo(
    _LyricItemComponent,
    (prev, curr) =>
        prev.light === curr.light &&
        prev.highlight === curr.highlight &&
        prev.text === curr.text &&
        prev.index === curr.index &&
        prev.fontSize === curr.fontSize,
);

export default LyricItemComponent;

const lyricStyles = StyleSheet.create({
    highlightItem: {
        opacity: 1,
    },
    item: {
        color: "white",
        opacity: 0.22,
        paddingHorizontal: rpx(52),
        paddingVertical: rpx(24),
        width: "100%",
        textAlign: "left",
        textAlignVertical: "center",
    },
    draggingItem: {
        opacity: 0.9,
        color: "#ea419e",
    },
});
