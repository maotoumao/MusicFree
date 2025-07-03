import React, { useState } from "react";
import rpx from "@/utils/rpx";
import { StyleSheet, View } from "react-native";
import ThemeText from "@/components/base/themeText";
import { hideDialog } from "../useDialog";
import Dialog from "./base";
import Input from "@/components/base/input";
import useColors from "@/hooks/useColors";
import { useI18N } from "@/core/i18n";

interface ISubscribeItem {
    name: string;
    url: string;
}
interface ISubscribePluginDialogProps {
    subscribeItem?: ISubscribeItem;
    onSubmit: (
        subscribeItem: ISubscribeItem,
        hideDialog: () => void,
        editingIndex?: number,
    ) => void;
    editingIndex?: number;
    onDelete?: (editingIndex: number, hideDialog: () => void) => void;
}

export default function SubscribePluginDialog(
    props: ISubscribePluginDialogProps,
) {
    const { subscribeItem, onSubmit, editingIndex, onDelete } = props;
    const [name, setName] = useState(subscribeItem?.name ?? "");
    const [url, setUrl] = useState(subscribeItem?.url ?? "");

    const colors = useColors();
    const { t } = useI18N();


    const inputStyles = {
        backgroundColor: colors.card,
        borderColor: colors.divider,
        color: colors.text,
    };

    const containerStyles = {
        backgroundColor: colors.backdrop,
    };

    return (
        <Dialog onDismiss={hideDialog}>
            <Dialog.Title>{t("dialog.subscriptionPluginDialog.title")}</Dialog.Title>
            <Dialog.Content style={[style.dialogContent, containerStyles]}>
                <View style={style.inputSection}>
                    <View style={style.labelContainer}>
                        <ThemeText style={style.label}>{t("common.name")}</ThemeText>
                    </View>
                    <View style={[style.inputContainer, { borderColor: colors.divider, backgroundColor: colors.card }]}>
                        <Input
                            hasHorizontalPadding={false}
                            style={[style.textInput, inputStyles]}
                            value={name}
                            onChangeText={text => {
                                setName(text);
                            }}
                            placeholder={t("common.name")}
                            placeholderTextColor={colors.textSecondary}
                        />
                    </View>
                </View>
                
                <View style={style.inputSection}>
                    <View style={style.labelContainer}>
                        <ThemeText style={style.label}>URL</ThemeText>
                    </View>
                    <View style={[style.inputContainer, { borderColor: colors.divider, backgroundColor: colors.card }]}>
                        <Input
                            hasHorizontalPadding={false}
                            style={[style.textInput, inputStyles]}
                            value={url}
                            onChangeText={text => {
                                setUrl(text);
                            }}
                        />
                    </View>
                </View>
            </Dialog.Content>
            <Dialog.Actions
                actions={[
                    {
                        type: "normal",
                        title: t("common.delete"),
                        show: editingIndex !== undefined,
                        onPress() {
                            onDelete?.(editingIndex!, hideDialog);
                        },
                    },
                    {
                        type: "primary",
                        title: t("common.save"),
                        onPress() {
                            onSubmit(
                                {
                                    name,
                                    url,
                                },
                                hideDialog,
                                editingIndex,
                            );
                        },
                    },
                ]}
            />
        </Dialog>
    );
}

const style = StyleSheet.create({
    dialogContent: {
        paddingHorizontal: rpx(24),
        paddingVertical: rpx(16),
        borderRadius: rpx(12),
    },
    inputSection: {
        marginBottom: rpx(24),
    },
    labelContainer: {
        marginBottom: rpx(8),
    },
    label: {
        fontSize: rpx(28),
        fontWeight: "500",
        opacity: 0.9,
    },
    inputContainer: {
        borderWidth: rpx(2),
        borderRadius: rpx(8),
        paddingHorizontal: rpx(16),
        paddingVertical: rpx(4),
        minHeight: rpx(72),
        justifyContent: "center",
        shadowOffset: {
            width: 0,
            height: rpx(2),
        },
        shadowOpacity: 0.1,
        shadowRadius: rpx(4),
        elevation: 2,
    },
    textInput: {
        fontSize: rpx(28),
        includeFontPadding: false,
        paddingVertical: rpx(12),
        borderWidth: 0,
        backgroundColor: "transparent",
    },
    headerWrapper: {
        flexDirection: "row",
        alignItems: "center",
        height: rpx(92),
    },
});
