import React from "react";
import { StyleProp, StyleSheet, ViewStyle } from "react-native";
import rpx from "@/utils/rpx";
import ThemeText from "./themeText";
import { iconSizeConst } from "@/constants/uiConst";
import useColors from "@/hooks/useColors";
import { TouchableOpacity } from "react-native-gesture-handler";
import Icon, { IIconName } from "@/components/base/icon.tsx";

interface IProps {
    icon: IIconName;
    onPress?: () => void;
    containerStyle?: StyleProp<ViewStyle>;
    withBorder?: boolean;
    children?: string;
}
export default function (props: IProps) {
    const { icon, children, onPress, containerStyle, withBorder } = props;
    const colors = useColors();

    return (
        <TouchableOpacity
            activeOpacity={0.7}
            style={[styles.container, withBorder ? styles.borderContainer : null, withBorder ? {
                borderColor: colors.text,
            } : null, containerStyle]}
            onPress={onPress}>
            <Icon name={icon} size={iconSizeConst.light} color={colors.text} />
            <ThemeText style={styles.text} fontSize={"content"}>
                {children}
            </ThemeText>
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    container: {
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: rpx(16),
        paddingVertical: rpx(8),
    },
    text: {
        marginLeft: rpx(8),
    },
    borderContainer: {
        borderWidth: rpx(1),
        borderRadius: 999,
        paddingHorizontal: rpx(24),
        paddingVertical: rpx(12),
    },
});
