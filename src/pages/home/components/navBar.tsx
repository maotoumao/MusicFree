import { ROUTE_PATH } from "@/core/router";
import { useNavigation } from "@react-navigation/native";
import React from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import rpx from "@/utils/rpx";
import ThemeText from "@/components/base/themeText";
import Icon from "@/components/base/icon.tsx";
import useColors from "@/hooks/useColors";
import { useI18N } from "@/core/i18n";

export default function NavBar() {
    const navigation = useNavigation<any>();
    const colors = useColors();
    const { t } = useI18N();

    return (
        <View style={styles.appbar}>
            <TouchableOpacity
                style={styles.titleButton}
                accessible
                accessibilityLabel={t("home.openSidebar.a11y")}
                onPress={() => {
                    navigation?.openDrawer();
                }}>
                <ThemeText
                    fontSize="pageTitle"
                    fontWeight="bold"
                    style={styles.pageTitleText}>
                    {t("home.title")}
                </ThemeText>
            </TouchableOpacity>
            <TouchableOpacity
                accessible
                accessibilityLabel={t("home.clickToSearch")}
                style={styles.searchButton}
                onPress={() => {
                    navigation.navigate(ROUTE_PATH.SEARCH_PAGE);
                }}>
                <Icon
                    name="magnifying-glass"
                    size={rpx(44)}
                    color={colors.text}
                />
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    appbar: {
        backgroundColor: "transparent",
        shadowColor: "transparent",
        width: "100%",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        height: rpx(90),
    },
    titleButton: {
        marginLeft: rpx(24),
        paddingVertical: rpx(8),
        flex: 1,
    },
    pageTitleText: {
        includeFontPadding: false,
    },
    // 图标按钮 + 内边距, 保证命中区域不小于 44pt
    searchButton: {
        padding: rpx(24),
        marginRight: rpx(8),
    },
});
