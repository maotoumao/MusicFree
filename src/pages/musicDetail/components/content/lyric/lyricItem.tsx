import React, { memo, useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, Text } from "react-native";
import rpx from "@/utils/rpx";
import useColors from "@/hooks/useColors";
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
    /**
     * AMLL 风格（Apple Music 那种歌词样式）
     * - 左对齐，而不是居中
     * - 当前行放大 + 加粗，其余行压暗，层次拉开
     * - 切换时带一段缓动，不会突兀地跳变
     */
    amll?: boolean;

    onLayout?: (index: number, height: number) => void;
}

function _LyricItemComponent(props: ILyricItemComponentProps) {
    const { light, highlight, text, onLayout, index, fontSize, amll } = props;

    const colors = useColors();

    // AMLL 风格下当前行的过渡进度：0 = 普通行，1 = 当前行
    const progress = useRef(new Animated.Value(highlight ? 1 : 0)).current;

    useEffect(() => {
        if (!amll) {
            return;
        }
        Animated.timing(progress, {
            toValue: highlight ? 1 : 0,
            duration: 280,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
        }).start();
    }, [amll, highlight, progress]);

    // 放大用 transform 而不是改 fontSize：不会触发重新布局，
    // 也就不会打乱上层按行高做的滚动定位
    const scale = progress.interpolate({
        inputRange: [0, 1],
        outputRange: [1, 1.08],
    });
    const amllOpacity = progress.interpolate({
        inputRange: [0, 1],
        outputRange: [0.42, 1],
    });

    // 非 AMLL 沿用原来的规则：默认 0.6、拖拽 0.9、当前行 1
    const opacity = !amll
        ? highlight
            ? 1
            : light
                ? 0.9
                : 0.6
        : light
            ? 0.9
            : amllOpacity;

    return (
        <Animated.Text
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
                amll ? lyricStyles.amllItem : null,
                {
                    opacity,
                    transform: amll ? [{ scale }] : undefined,
                },
                // 拖拽态优先（沿用原有表现：拖拽中的行统一显示为白色）
                light
                    ? lyricStyles.draggingItem
                    : highlight
                        ? [
                            lyricStyles.highlightItem,
                            {
                                color: colors.primary,
                                // 当前行加粗，配合放大让层次更明显
                                fontWeight: amll ? "bold" : undefined,
                            },
                        ]
                        : null,
            ]}>
            {text}
        </Animated.Text>
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
        prev.fontSize === curr.fontSize &&
        prev.amll === curr.amll,
);

export default LyricItemComponent;

const lyricStyles = StyleSheet.create({
    highlightItem: {
        opacity: 1,
    },
    item: {
        color: "white",
        opacity: 0.6,
        paddingHorizontal: rpx(64),
        paddingVertical: rpx(24),
        width: "100%",
        textAlign: "center",
        textAlignVertical: "center",
    },
    // AMLL：左对齐 + 更宽的侧边留白
    amllItem: {
        textAlign: "left",
        paddingHorizontal: rpx(72),
        paddingVertical: rpx(20),
    },
    draggingItem: {
        opacity: 0.9,
        color: "white",
    },
});
