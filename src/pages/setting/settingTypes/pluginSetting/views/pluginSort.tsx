import AppBar from "@/components/base/appBar";
import HorizontalSafeAreaView from "@/components/base/horizontalSafeAreaView.tsx";
import SortableFlatList from "@/components/base/SortableFlatList";
import ThemeText from "@/components/base/themeText";
import globalStyle from "@/constants/globalStyle";
import { useI18N } from "@/core/i18n";
import PluginManager, { Plugin, useSortedPlugins } from "@/core/pluginManager";
import useColors from "@/hooks/useColors";
import rpx from "@/utils/rpx";
import Toast from "@/utils/toast";
import React, { useState } from "react";
import { StatusBar, StyleSheet, TouchableOpacity, View } from "react-native";

const ITEM_HEIGHT = rpx(96);
const marginTop = rpx(188) + (StatusBar.currentHeight ?? 0);

export default function PluginSort() {
    const plugins = useSortedPlugins();
    const [sortingPlugins, setSortingPlugins] = useState([...plugins]);

    const colors = useColors();
    const { t } = useI18N();

    function renderSortingItem({ item }: { item: Plugin }) {
        return (
            <View style={style.sortItem}>
                <ThemeText>{item.name}</ThemeText>
            </View>
        );
    }
    return (
        <>
            <AppBar>{t("pluginSetting.menu.sort")}</AppBar>
            <HorizontalSafeAreaView style={style.sortWrapper}>
                <>
                    <ThemeText fontWeight="bold">{t("pluginSetting.menu.sort")}</ThemeText>
                    <TouchableOpacity
                        onPress={async () => {
                            PluginManager.setPluginOrder(sortingPlugins);
                            Toast.success(t("toast.saveSuccess"));
                        }}>
                        <ThemeText>{t("common.done")}</ThemeText>
                    </TouchableOpacity>
                </>
            </HorizontalSafeAreaView>
            <HorizontalSafeAreaView style={globalStyle.flex1}>
                <SortableFlatList
                    data={sortingPlugins}
                    activeBackgroundColor={colors.placeholder}
                    marginTop={marginTop}
                    renderItem={renderSortingItem}
                    itemHeight={ITEM_HEIGHT}
                    itemJustifyContent={"space-between"}
                    onSortEnd={data => {
                        setSortingPlugins(data);
                    }}
                />
            </HorizontalSafeAreaView>
        </>
    );
}

const style = StyleSheet.create({
    sortWrapper: {
        marginHorizontal: rpx(24),
        marginTop: rpx(36),
        justifyContent: "space-between",
        height: rpx(64),
        alignItems: "center",
        flexDirection: "row",
    },
    sortItem: {
        height: ITEM_HEIGHT,
        width: rpx(500),
        paddingLeft: rpx(24),
        justifyContent: "center",
    },
});
