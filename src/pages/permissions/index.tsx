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
import React, { useEffect, useRef, useState } from "react";
import { AppState, StyleSheet } from "react-native";

type IPermissionTypes = "floatingWindow" | "fileStorage";

export default function Permissions() {
    const appState = useRef(AppState.currentState);
    const [permissions, setPermissions] = useState<
        Record<IPermissionTypes, boolean>
    >({
        floatingWindow: false,
        fileStorage: false,
        // background: false,
    });
    const { t } = useI18N();

    async function checkPermission(type?: IPermissionTypes) {
        let newPermission = {
            ...permissions,
        };
        if (!type || type === "floatingWindow") {
            const hasPermission = await LyricUtil.checkSystemAlertPermission();
            newPermission.floatingWindow = hasPermission;
        }
        if (!type || type === "fileStorage") {
            const hasPermission = await NativeUtils.checkStoragePermission();
            console.log("HAS", hasPermission);
            newPermission.fileStorage = hasPermission;
        }
        // if (!type || type === 'background') {

        // }

        setPermissions(newPermission);
    }

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
    }, []);

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
                <ThemeSwitch value={permissions.floatingWindow} />
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
                <ThemeSwitch value={permissions.fileStorage} />
            </ListItem>
            {/* <ListItem withHorizontalPadding heightType="big">
                <ListItem.Content
                    title="后台运行"
                    description="用以在后台播放音乐"></ListItem.Content>
                <ThemeSwitch value={permissions.background}></ThemeSwitch>
            </ListItem> */}
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
