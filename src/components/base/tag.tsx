import React from "react";
import { StyleProp, StyleSheet, TextStyle, View, ViewStyle } from "react-native";
import rpx from "@/utils/rpx";
import ThemeText from "./themeText";
import useColors from "@/hooks/useColors";

interface ITagProps {
    tagName: string;
    containerStyle?: StyleProp<ViewStyle>;
    style?: StyleProp<TextStyle>;
}
export default function Tag(props: ITagProps) {
    const colors = useColors();
    return (
        <View
            style={[
                styles.tag,
                { backgroundColor: colors.card, borderColor: colors.divider },
                props.containerStyle,
            ]}>
            <ThemeText style={[styles.tagText, props.style]} fontSize="tag">
                {props.tagName}
            </ThemeText>
        </View>
    );
}

const styles = StyleSheet.create({
    tag: {
        marginLeft: rpx(12),
        paddingHorizontal: rpx(12),
        borderRadius: rpx(12),
        paddingVertical: rpx(4),
        justifyContent: "center",
        alignItems: "center",
        flexShrink: 0,
        borderWidth: 1,
        borderStyle: "solid",
    },
    tagText: {
        textAlignVertical: "center",
    },
});
