import { ROUTE_PATH } from "@/core/router";
import { useNavigation } from "@react-navigation/native";
import React from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import rpx from "@/utils/rpx";
import useColors from "@/hooks/useColors";
import ThemeText from "@/components/base/themeText";
import IconButton from "@/components/base/iconButton";
import { useI18N } from "@/core/i18n";

export default function NavBar() {
    const navigation = useNavigation<any>();
    const colors = useColors();
    const { t } = useI18N();

    return (
        <View style={styles.appbar}>
            <View style={styles.topBar}>
                <IconButton
                    accessibilityLabel={t("home.openSidebar.a11y")}
                    name="bars-3"
                    style={styles.menu}
                    color={colors.text}
                    onPress={() => {
                        navigation?.openDrawer();
                    }}
                />
                <TouchableOpacity
                    accessible
                    accessibilityLabel={t("home.clickToSearch")}
                    style={styles.searchButton}
                    onPress={() => {
                        navigation.navigate(ROUTE_PATH.SEARCH_PAGE);
                    }}>
                    <IconButton
                        accessible={false}
                        name="magnifying-glass"
                        sizeType="normal"
                        color={colors.text}
                    />
                </TouchableOpacity>
            </View>
            <ThemeText
                fontSize="pageTitle"
                fontWeight="bold"
                style={styles.pageTitleText}>
                {t("home.title")}
            </ThemeText>
        </View>
    );
}

const styles = StyleSheet.create({
    appbar: {
        backgroundColor: "transparent",
        shadowColor: "transparent",
        width: "100%",
    },
    topBar: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        width: "100%",
        height: rpx(88),
    },
    // 图标按钮 + 内边距, 保证命中区域不小于 44pt
    searchButton: {
        padding: rpx(24),
        marginRight: rpx(8),
    },
    menu: {
        marginLeft: rpx(24),
    },
    pageTitleText: {
        marginLeft: rpx(24),
        includeFontPadding: false,
    },
});
