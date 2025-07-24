import React, { useState } from "react";
import rpx from "@/utils/rpx";
import { StyleSheet, View } from "react-native";
import ThemeText from "@/components/base/themeText";
import { hideDialog } from "../useDialog";
import Dialog from "./base";
import Input from "@/components/base/input";
import useColors from "@/hooks/useColors";
import { useI18N } from "@/core/i18n";
import PersistStatus from "@/utils/persistStatus";

interface ISetScheduleCloseTimeDialogProps {
    onOk?: (minutes: number) => void;
}

export default function SetScheduleCloseTimeDialog(
    props: ISetScheduleCloseTimeDialogProps,
) {
    const { onOk } = props;
    const [timeInput, setTimeInput] = useState("");
    
    const colors = useColors();
    const { t } = useI18N();

    // Get last custom time as placeholder
    const lastCustomTime = PersistStatus.get("app.scheduleCloseTime");
    const placeholder = lastCustomTime ? String(lastCustomTime) : "";

    const handleConfirm = () => {
        let minutes = 0;
        
        if (timeInput.trim()) {
            minutes = parseInt(timeInput.trim(), 10);
        } else if (placeholder) {
            minutes = parseInt(placeholder, 10);
        }
        
        // Validate input
        if (isNaN(minutes) || minutes <= 0 || minutes > 1440) {
            return;
        }
        
        // Save to persistent storage
        PersistStatus.set("app.scheduleCloseTime", minutes);
        
        onOk?.(minutes);
        hideDialog();
    };

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
            <Dialog.Title>{t("dialog.setScheduleCloseTime.title")}</Dialog.Title>
            <Dialog.Content style={[style.dialogContent, containerStyles]}>
                <View style={style.inputSection}>
                    <View style={style.inputRow}>
                        <View style={[style.inputContainer, { borderColor: colors.divider, backgroundColor: colors.card }]}>
                            <Input
                                hasHorizontalPadding={false}
                                style={[style.textInput, inputStyles]}
                                value={timeInput}
                                onChangeText={text => {
                                    // Only allow numbers
                                    const numericText = text.replace(/[^0-9]/g, "");
                                    // Limit to 4 digits (max 1440 minutes = 24 hours)
                                    if (numericText.length <= 4) {
                                        setTimeInput(numericText);
                                    }
                                }}
                                placeholder={placeholder || t("dialog.setScheduleCloseTime.placeholder")}
                                placeholderTextColor={colors.textSecondary}
                                keyboardType="numeric"
                                maxLength={4}
                            />
                        </View>
                        <View style={style.unitContainer}>
                            <ThemeText style={style.unitText} fontColor="textSecondary">
                                {t("dialog.setScheduleCloseTime.unit")}
                            </ThemeText>
                        </View>
                    </View>
                    <View style={style.hintContainer}>
                        <ThemeText style={style.hintText} fontSize="subTitle" fontColor="textSecondary">
                            {t("dialog.setScheduleCloseTime.hint")}
                        </ThemeText>
                    </View>
                </View>
            </Dialog.Content>
            <Dialog.Actions
                actions={[
                    {
                        type: "normal",
                        title: t("common.cancel"),
                        onPress() {
                            hideDialog();
                        },
                    },
                    {
                        type: "primary",
                        title: t("common.confirm"),
                        onPress: handleConfirm,
                    },
                ]}
            />
        </Dialog>
    );
}

const style = StyleSheet.create({
    dialogContent: {
        paddingHorizontal: rpx(24),
        paddingVertical: rpx(20),
        borderRadius: rpx(12),
    },
    inputSection: {
        marginBottom: rpx(8),
    },
    inputRow: {
        flexDirection: "row",
        alignItems: "center",
        marginBottom: rpx(16),
    },
    inputContainer: {
        flex: 1,
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
        textAlign: "center",
    },
    unitContainer: {
        marginLeft: rpx(16),
        paddingHorizontal: rpx(8),
    },
    unitText: {
        fontSize: rpx(28),
        fontWeight: "500",
    },
    hintContainer: {
        paddingHorizontal: rpx(4),
    },
    hintText: {
        lineHeight: rpx(32),
        textAlign: "center",
    },
});
