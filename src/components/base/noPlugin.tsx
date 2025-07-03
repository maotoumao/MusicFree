import React from "react";
import { StyleSheet, View } from "react-native";
import rpx from "@/utils/rpx";
import ThemeText from "@/components/base/themeText";
import { useI18N } from "@/core/i18n";

interface IProps {
    notSupportType?: string;
}

export default function NoPlugin(props: IProps) {
    const { t } = useI18N();

    return (
        <View style={style.wrapper}>
            <ThemeText fontSize="title">
                {props.notSupportType ? t("noPlugin.titleWithType", {
                    type: props.notSupportType,
                }) : t("noPlugin.title")}
            </ThemeText>
            <ThemeText
                style={style.mt}
                fontSize="subTitle"
                fontColor="textSecondary">
                {t("noPlugin.description")}
            </ThemeText>
        </View>
    );
}

const style = StyleSheet.create({
    wrapper: {
        width: rpx(750),
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
    },
    mt: {
        marginTop: rpx(24),
    },
});
