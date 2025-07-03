import React from "react";
import { StyleSheet } from "react-native";
import rpx from "@/utils/rpx";
import AppBar from "@/components/base/appBar";
import VerticalSafeAreaView from "@/components/base/verticalSafeAreaView";
import globalStyle from "@/constants/globalStyle";
import Button from "@/components/base/textButton.tsx";
import Body from "./body";
import { useNavigation } from "@react-navigation/native";
import { useI18N } from "@/core/i18n";

export default function SetCustomTheme() {
    const navigation = useNavigation();
    const { t } = useI18N();

    return (
        <VerticalSafeAreaView style={globalStyle.fwflex1}>
            <AppBar
                withStatusBar
                actionComponent={
                    <Button
                        style={styles.submit}
                        onPress={() => {
                            navigation.goBack();
                        }}
                        fontColor="appBarText">
                        {t("common.done")}
                    </Button>
                }>
                {t("setCustomTheme.customizeBackground")}
            </AppBar>
            <Body />
        </VerticalSafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        width: rpx(750),
    },
    submit: {
        justifyContent: "center",
    },
});
