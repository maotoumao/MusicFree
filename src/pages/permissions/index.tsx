import AppBar from "@/components/base/appBar";
import ListItem from "@/components/base/listItem";
import StatusBar from "@/components/base/statusBar";
import ThemeSwitch from "@/components/base/switch";
import ThemeText from "@/components/base/themeText";
import VerticalSafeAreaView from "@/components/base/verticalSafeAreaView";
import globalStyle from "@/constants/globalStyle";
import { useI18N } from "@/core/i18n";
import LyricUtil from "@/native/lyricUtil";
import NativeUtils from "@/native/utils";
import rpx from "@/utils/rpx";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { AppState, StyleSheet } from "react-native";

type IPermissionTypes = "floatingWindow" | "fileStorage" | "batteryOptimization";

export default function Permissions() {
    const appState = useRef(AppState.currentState);
    const [permissions, setPermissions] = useState<
        Record<IPermissionTypes, boolean>
    >({
        floatingWindow: false,
        fileStorage: false,
        batteryOptimization: false,
    });
    const { t } = useI18N();

    const checkPermission = useCallback(async (type?: IPermissionTypes) => {
        const updates: Partial<Record<IPermissionTypes, boolean>> = {};

        if (!type || type === "floatingWindow") {
            updates.floatingWindow = await LyricUtil.checkSystemAlertPermission();
        }
        if (!type || type === "fileStorage") {
            updates.fileStorage = await NativeUtils.checkStoragePermission();
        }
        if (!type || type === "batteryOptimization") {
            updates.batteryOptimization = await NativeUtils.isIgnoringBatteryOptimizations();
        }

        setPermissions(prev => ({ ...prev, ...updates }));
    }, []);

    const toggleBatteryOptimization = useCallback(() => {
        if (permissions.batteryOptimization) {
            NativeUtils.openBatteryOptimizationSettings();
        } else {
            NativeUtils.requestIgnoreBatteryOptimizations();
        }
    }, [permissions.batteryOptimization]);

    useEffect(() => {
        checkPermission();
        const subscription = AppState.addEventListener(
            "change",
            nextAppState => {
                if (
                    appState.current.match(/inactive|background/) &&
                    nextAppState === "active"
                ) {
                    checkPermission();
                }

                appState.current = nextAppState;
            },
        );

        return () => {
            subscription.remove();
        };
    }, [checkPermission]);

    return (
        <VerticalSafeAreaView style={globalStyle.fwflex1}>
            <StatusBar />
            <AppBar>{t("permissionSetting.title")}</AppBar>
            <ThemeText style={styles.description}>
                {t("permissionSetting.description")}
            </ThemeText>
            <ListItem
                withHorizontalPadding
                heightType="big"
                onPress={() => {
                    LyricUtil.requestSystemAlertPermission();
                }}>
                <ListItem.Content
                    title={t("permissionSetting.floatWindowPermission")}
                    description={t("permissionSetting.floatWindowPermissionDescription")}
                />
                <ThemeSwitch
                    value={permissions.floatingWindow}
                    onValueChange={() => {
                        LyricUtil.requestSystemAlertPermission();
                    }}
                />
            </ListItem>
            <ListItem
                withHorizontalPadding
                heightType="big"
                onPress={() => {
                    NativeUtils.requestStoragePermission();
                }}>
                <ListItem.Content
                    title={t("permissionSetting.fileReadWritePermission")}
                    description={t("permissionSetting.fileReadWritePermissionDescription")}
                />
                <ThemeSwitch
                    value={permissions.fileStorage}
                    onValueChange={() => {
                        NativeUtils.requestStoragePermission();
                    }}
                />
            </ListItem>
            <ListItem
                withHorizontalPadding
                heightType="big"
                onPress={toggleBatteryOptimization}>
                <ListItem.Content
                    title={t("permissionSetting.ignoreBatteryOptimization")}
                    description={t("permissionSetting.ignoreBatteryOptimizationDescription")}
                />
                <ThemeSwitch
                    value={permissions.batteryOptimization}
                    onValueChange={toggleBatteryOptimization}
                />
            </ListItem>
        </VerticalSafeAreaView>
    );
}

const styles = StyleSheet.create({
    description: {
        width: "100%",
        paddingHorizontal: rpx(24),
        marginVertical: rpx(36),
    },
});
