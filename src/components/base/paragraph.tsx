import React from "react";
import { StyleSheet, TextProps } from "react-native";
import ThemeText from "./themeText";
import { fontSizeConst } from "@/constants/uiConst";

interface IParagraphProps extends TextProps {}
export default function Paragraph(props: IParagraphProps) {
    return <ThemeText style={styles.container} {...props} />;
}

const styles = StyleSheet.create({
    container: {
        fontSize: fontSizeConst.content,
        lineHeight: fontSizeConst.content * 1.8,
        marginVertical: 2,
        letterSpacing: 0.25,
    },
});
