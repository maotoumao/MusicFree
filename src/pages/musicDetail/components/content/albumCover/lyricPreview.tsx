import React, { useMemo } from "react";
import { StyleSheet, Text, TouchableOpacity } from "react-native";
import rpx from "@/utils/rpx";
import { useCurrentLyricItem, useLyricState } from "@/core/lyricManager";

interface ILyricPreviewProps {
    onPress?: () => void;
}

export default function LyricPreview(props: ILyricPreviewProps) {
    const { onPress } = props;
    const { lyrics } = useLyricState();
    const currentLrcItem = useCurrentLyricItem();

    const lines = useMemo(() => {
        if (!lyrics?.length) {
            return null;
        }
        const index =
            !currentLrcItem || currentLrcItem.index === -1
                ? 0
                : Math.min(currentLrcItem.index, lyrics.length - 1);
        return {
            prev: lyrics[index - 1]?.lrc,
            current: lyrics[index]?.lrc ?? "",
            next: lyrics[index + 1]?.lrc,
            // 前奏阶段(index=-1)不高亮当前行
            active: !!currentLrcItem && currentLrcItem.index !== -1,
        };
    }, [lyrics, currentLrcItem]);

    if (!lines) {
        return null;
    }

    return (
        <TouchableOpacity
            style={styles.wrapper}
            activeOpacity={0.7}
            accessible
            accessibilityLabel={"歌词预览, 点击查看完整歌词"}
            onPress={onPress}>
            <Text style={[styles.line, styles.dim, ]} numberOfLines={1}>
                {lines.prev ?? ""}
            </Text>
            <Text
                style={[
                    styles.line,
                    lines.active ? styles.current : styles.dim,
                    ,
                ]}
                numberOfLines={1}>
                {lines.current}
            </Text>
            <Text style={[styles.line, styles.dim, ]} numberOfLines={1}>
                {lines.next ?? ""}
            </Text>
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    wrapper: {
        width: "100%",
        paddingHorizontal: rpx(52),
        marginTop: rpx(16),
        marginBottom: rpx(56),
    },
    line: {
        fontSize: rpx(36),
        lineHeight: rpx(56),
        includeFontPadding: false,
    },
    current: {
        fontWeight: "600",
    },
    dim: {
        opacity: 0.4,
    },
});
