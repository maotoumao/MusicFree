import { ROUTE_PATH } from "@/core/router";
import { useNavigation } from "@react-navigation/native";
import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import rpx from "@/utils/rpx";
import useColors from "@/hooks/useColors";
import ThemeText from "@/components/base/themeText";
import Color from "color";
import IconButton from "@/components/base/iconButton";
import Icon from "@/components/base/icon.tsx";
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
                <Pressable
                    style={[
                        styles.searchBar,
                        {
                            backgroundColor: colors.placeholder,
                        },
                    ]}
                    accessible
                    accessibilityLabel={t("home.clickToSearch")}
                    onPress={() => {
                        navigation.navigate(ROUTE_PATH.SEARCH_PAGE);
                    }}>
                    <Icon
                        accessible={false}
                        name="magnifying-glass"
                        size={rpx(32)}
                        color={Color(colors.text).alpha(0.6).toString()}
                    />
                    <ThemeText
                        accessible={false}
                        fontSize="subTitle"
                        style={[styles.text]}>
                        {t("home.clickToSearch")}
                    </ThemeText>
                </Pressable>
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
        width: "100%",
        height: rpx(88),
    },
    searchBar: {
        marginHorizontal: rpx(24),
        flexDirection: "row",
        alignItems: "center",
        flex: 1,
        height: "72%",
        maxHeight: rpx(64),
        borderRadius: rpx(36),
        paddingHorizontal: rpx(20),
    },
    text: {
        marginLeft: rpx(12),
        opacity: 0.6,
    },
    menu: {
        marginLeft: rpx(24),
    },
    pageTitleText: {
        marginLeft: rpx(24),
        includeFontPadding: false,
    },
});
