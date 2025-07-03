import ListItem from "@/components/base/listItem";
import { vmax } from "@/utils/rpx";
import Toast from "@/utils/toast";
import React from "react";
import { View } from "react-native";

import NoPlugin from "@/components/base/noPlugin";
import { showDialog } from "@/components/dialogs/useDialog";
import globalStyle from "@/constants/globalStyle";
import PluginManager from "@/core/pluginManager";
import { FlatList } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import PanelBase from "../base/panelBase";
import PanelHeader from "../base/panelHeader";
import { showPanel } from "../usePanel";
import { useI18N } from "@/core/i18n";

export default function ImportMusicSheet() {
    const validPlugins = PluginManager.getSortedPluginsWithAbility("importMusicSheet");
    const { t } = useI18N();

    const safeAreaInsets = useSafeAreaInsets();

    return (
        <PanelBase
            height={vmax(60)}
            renderBody={() => (
                <>
                    <PanelHeader hideButtons title={t("panel.importMusicSheet.title")} />
                    {validPlugins.length ? (
                        <View style={globalStyle.fwflex1}>
                            <FlatList
                                data={validPlugins}
                                keyExtractor={plugin => plugin.hash}
                                style={{
                                    marginBottom: safeAreaInsets.bottom,
                                }}
                                renderItem={({ item: plugin }) => (
                                    <ListItem
                                        withHorizontalPadding
                                        key={`${plugin.hash}`}
                                        onPress={async () => {
                                            showPanel("SimpleInput", {
                                                title: t("panel.importMusicSheet.title"),
                                                placeholder: t("panel.importMusicSheet.placeholder"),
                                                hints: plugin.instance.hints
                                                    ?.importMusicSheet,
                                                maxLength: 1000,                                                async onOk(text, closePanel) {
                                                    Toast.success(
                                                        t("panel.importMusicSheet.importing"),
                                                    );
                                                    closePanel();
                                                    const result =
                                                        await plugin.methods.importMusicSheet(
                                                            text,
                                                        );
                                                    if (result && result.length > 0) {
                                                        showDialog(
                                                            "SimpleDialog",
                                                            {
                                                                title: t("panel.importMusicSheet.prepareImport"),
                                                                content: t("panel.importMusicSheet.foundSongs", { count: result.length }),
                                                                onOk() {
                                                                    showPanel(
                                                                        "AddToMusicSheet",
                                                                        {
                                                                            musicItem:
                                                                                result,
                                                                        },
                                                                    );
                                                                },
                                                            },
                                                        );                                                    
                                                    } else {
                                                        Toast.warn(
                                                            t("panel.importMusicSheet.invalidLink"),
                                                        );
                                                    }
                                                },
                                            });
                                        }}>
                                        <ListItem.Content title={plugin.name} />
                                    </ListItem>
                                )}
                            />
                        </View>                    ) : (
                        <NoPlugin notSupportType={t("panel.importMusicSheet.title")} />
                    )}
                </>
            )}
        />
    );
}
