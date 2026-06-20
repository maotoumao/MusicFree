import AppBar from "@/components/base/appBar";
import { useAtom } from "jotai";
import { musicSheetChangedAtom, sheetTypeAtom } from "../store/atom";
import { useI18N } from "@/core/i18n";
import { Pressable, StyleSheet, View } from "react-native";
import { ILanguageData } from "@/types/core/i18n";
import ThemeText from "@/components/base/themeText";
import Divider from "@/components/base/divider";
import rpx from "@/utils/rpx";
import useColors from "@/hooks/useColors";
import { Fragment, useMemo } from "react";
import IconButton from "@/components/base/iconButton";
import { saveEditingMusicSheet } from "../store/action";
import Toast from "@/utils/toast";


const tabs: Array<{
    key: "local" | "starred",
    i18nKey: keyof ILanguageData,
}> = [{
    key: "local",
    i18nKey: "home.myPlaylists",
}, {
    key: "starred",
    i18nKey: "home.starredPlaylists",
}];

export default function NavBar() {
    const [sheetType, setSheetType] = useAtom(sheetTypeAtom);

    const { t } = useI18N();
    const colors = useColors();
    const [sheetChanged, setSheetChanged] = useAtom(musicSheetChangedAtom);
    
    const selectedIndicatorStyle = useMemo(() => {
        return [
            styles.selectedIndicator,
            {
                backgroundColor: colors.primary,
            },
        ];
    }, [colors]);

    return (
        <AppBar contentStyle={styles.navBarContentStyle}
            actionComponent={<IconButton
                name="save-outline"
                sizeType="normal"
                color={sheetChanged ? colors.primary : colors.appBarText}
                opacity={sheetChanged ? 1 : 0.6}
                onPress={() => {
                    if (sheetChanged) {
                        saveEditingMusicSheet();
                        Toast.success(t("toast.saveSuccess"));
                    }
                }}
            />}
        >
            {tabs.map((tab, index) => (
                <Fragment key={tab.key}>
                    <Pressable onPress={() => {
                        if (sheetType !== tab.key) {
                            setSheetType(tab.key);
                            setSheetChanged(false);
                        }
                    }}>
                        <ThemeText style={sheetType === tab.key ? styles.selectTabText : null}>{t(tab.i18nKey)}</ThemeText>
                        <View style={sheetType === tab.key ? selectedIndicatorStyle : null} />
                    </Pressable>

                    { index === 0 ? <Divider vertical style={styles.divider} /> : null}
                </Fragment>
            ))}
        </AppBar>
    );
}


const styles = StyleSheet.create({
    navBarContentStyle: {
        flexDirection: "row",
        justifyContent: "center",

    },
    divider: {
        marginHorizontal: rpx(16),
        width: rpx(4),
        height: rpx(24),
    },
    selectTabText: {
        fontWeight: "bold",
    },
    selectedIndicator: {
        position: "absolute",
        bottom: -rpx(12),
        height: rpx(6),
        width: "100%",
    },
});