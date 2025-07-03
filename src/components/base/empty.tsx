import React from "react";
import { StyleSheet, View } from "react-native";
import rpx from "@/utils/rpx";
import ThemeText from "./themeText";
import { useI18N } from "@/core/i18n";

interface IEmptyProps {
    content?: string;
}
export default function Empty(props: IEmptyProps) {
    const { t } = useI18N();

    return (
        <View style={style.wrapper}>
            <ThemeText fontSize="title">
                {props?.content ?? t("common.emptyList")}
            </ThemeText>
        </View>
    );
}

const style = StyleSheet.create({
    wrapper: {
        width: "100%",
        flex: 1,
        minHeight: rpx(300),
        justifyContent: "center",
        alignItems: "center",
    },
});
