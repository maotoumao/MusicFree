import React, { useState } from "react";
import ThemeText from "@/components/base/themeText";
import { StyleSheet, View } from "react-native";
import rpx, { vh } from "@/utils/rpx";
import { ScrollView, TouchableOpacity } from "react-native-gesture-handler";
import { hideDialog } from "../useDialog";
import Checkbox from "@/components/base/checkbox";
import Dialog from "./base";
import PersistStatus from "@/utils/persistStatus";
import NativeUtils from "@/native/utils";
import { useI18N } from "@/core/i18n";

export default function CheckStorage() {
    const [skipState, setSkipState] = useState(false);

    const { t } = useI18N();

    const onCancel = () => {
        if (skipState) {
            PersistStatus.set("app.skipBootstrapStorageDialog", true);
        }
        hideDialog();
    };

    return (
        <Dialog onDismiss={onCancel}>
            <Dialog.Title stringContent>{t("dialog.checkStorage.title")}</Dialog.Title>
            <ScrollView style={styles.scrollView}>
                <ThemeText style={styles.item}>
                    {t("dialog.checkStorage.content.0")}
                </ThemeText>
                <ThemeText style={styles.item}>
                    {t("dialog.checkStorage.content.1")}
                </ThemeText>
                <ThemeText style={styles.item}>
                    {t("dialog.checkStorage.content.2")}
                </ThemeText>
                <ThemeText style={styles.item}>
                    {t("dialog.checkStorage.content.3")}
                </ThemeText>
            </ScrollView>

            <TouchableOpacity
                style={styles.checkBox}
                onPress={() => {
                    setSkipState(state => !state);
                }}>
                <View style={styles.checkboxGroup}>
                    <Checkbox checked={skipState} />
                    <ThemeText style={styles.checkboxHint}>{t("dialog.checkStorage.button.doNotShowAgain")}</ThemeText>
                </View>
            </TouchableOpacity>

            <Dialog.Actions
                actions={[
                    {
                        title: t("common.cancel"),
                        type: "normal",
                        onPress: onCancel,
                    },
                    {
                        title: t("dialog.checkStorage.button.doNotShowAgain"),
                        type: "primary",
                        onPress: () => {
                            NativeUtils.requestStoragePermission();
                            hideDialog();
                        },
                    },
                ]}
            />
        </Dialog>
    );
}

const styles = StyleSheet.create({
    item: {
        marginBottom: rpx(20),
        lineHeight: rpx(36),
    },

    scrollView: {
        maxHeight: vh(40),
        paddingHorizontal: rpx(26),
    },
    checkBox: {
        marginHorizontal: rpx(24),
        marginVertical: rpx(36),
    },
    checkboxGroup: {
        flexDirection: "row",
        alignItems: "center",
    },
    checkboxHint: {
        marginLeft: rpx(12),
    },
});
