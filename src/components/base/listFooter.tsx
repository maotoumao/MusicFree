import React from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import rpx from "@/utils/rpx";
import { fontSizeConst } from "@/constants/uiConst";
import ThemeText from "./themeText";
import useColors from "@/hooks/useColors";
import { RequestStateCode } from "@/constants/commonConst";
import { Pressable } from "react-native-gesture-handler";
import { useI18N } from "@/core/i18n";


interface IProps {
    state: RequestStateCode;
    onRetry?: () => void;
}

export default function ListFooter(props: IProps) {
    const { state } = props;

    const colors = useColors();
    const { t } = useI18N();


    if (state === RequestStateCode.ERROR) {
        return <View style={style.wrapper} >
            <Pressable hitSlop={{
                top: rpx(36),
                bottom: rpx(36),
                left: rpx(72),
                right: rpx(72),
            }} onPress={props.onRetry}>
                <ThemeText fontSize="content" fontColor="textSecondary">
                    {t("common.failToLoad")}<Text style={[style.underline, {
                        textDecorationColor: colors.textSecondary,
                    }]}>{" "}{t("common.clickToRetry")}</Text>
                </ThemeText>
            </Pressable>
        </View>;
    } else if (state === RequestStateCode.PENDING_REST_PAGE || state === RequestStateCode.PARTLY_DONE) {
        return <View style={style.wrapper}>
            <ActivityIndicator
                animating
                color={colors.textSecondary}
                size={fontSizeConst.appbar}
            />
            <ThemeText fontColor='textSecondary'>{t("common.loading")}</ThemeText>
        </View>;
    } else if (state === RequestStateCode.FINISHED) {
        return <View style={style.wrapper}>
            <ThemeText fontSize="content" fontColor="textSecondary">
                {t("common.listReachEnd")}
            </ThemeText>
        </View>;
    }

    // PENDING_FIRST_PAGE, IDLE
    return null;
}

const style = StyleSheet.create({
    wrapper: {
        width: "100%",
        height: rpx(120),
        justifyContent: "center",
        alignItems: "center",
        flexDirection: "row",
        columnGap: rpx(24),
    },
    underline: {
        textDecorationLine: "underline",
        textDecorationStyle: "solid",
    },

});
