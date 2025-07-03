import React, { memo } from "react";

import useColors from "@/hooks/useColors";
import pluginManager, { Plugin, usePluginEnabled } from "@/core/pluginManager";

import Toast from "@/utils/toast";
import Clipboard from "@react-native-clipboard/clipboard";
import { showDialog } from "@/components/dialogs/useDialog";
import { showPanel } from "@/components/panels/usePanel";
import rpx from "@/utils/rpx";
import { StyleSheet, View } from "react-native";
import ThemeText from "@/components/base/themeText";
import IconTextButton from "@/components/base/iconTextButton";
import ThemeSwitch from "@/components/base/switch";
import { IIconName } from "@/components/base/icon.tsx";
import { useI18N } from "@/core/i18n";
import IconButton from "@/components/base/iconButton";
import useRerender from "@/hooks/useRerender";

interface IPluginItemProps {
    plugin: Plugin;
}

interface IOption {
    title: string;
    icon: IIconName;
    onPress?: () => void;
    show?: boolean;
}

function _PluginItem(props: IPluginItemProps) {
    const { plugin } = props;
    const colors = useColors();
    const enabled = usePluginEnabled(plugin);
    const { t } = useI18N();
    const rerender = useRerender();

    const alternativePluginName = pluginManager.getAlternativePluginName(plugin);

    const options: IOption[] = [
        {
            title: t("pluginSetting.pluginItem.options.updatePlugin"),
            icon: "arrow-path",
            async onPress() {
                try {
                    await pluginManager.updatePlugin(plugin);
                    Toast.success(t("toast.pluginUpdateSuccess"));
                } catch (e: any) {
                    Toast.warn(e?.message ?? t("toast.failToUpdatePlugin"));
                }
            },
            show: !!plugin.instance.srcUrl,
        },
        {
            title: t("pluginSetting.pluginItem.options.sharePlugin"),
            icon: "share",
            async onPress() {
                try {
                    Clipboard.setString(plugin.instance.srcUrl!);
                    Toast.success(t("toast.copiedToClipboard"));
                } catch (e: any) {
                    Toast.warn(e?.message ?? t("toast.failToSharePlugin"));
                }
            },
            show: !!plugin.instance.srcUrl,
        },
        {
            title: t("pluginSetting.pluginItem.options.uninstallPlugin"),
            icon: "trash-outline",
            show: true,
            onPress() {
                showDialog("SimpleDialog", {
                    title: t("pluginSetting.pluginItem.options.uninstallPlugin"),
                    content: t("pluginSetting.pluginItem.options.uninstallPluginContent", {
                        name: plugin.name,
                    }),
                    async onOk() {
                        try {
                            await pluginManager.uninstallPlugin(plugin.hash);
                            Toast.success(t("toast.pluginUninstalled"));
                        } catch {
                            Toast.warn(t("toast.failToUpdatePlugin"));
                        }
                    },
                });
            },
        },
        {
            title: t("pluginSetting.pluginItem.options.alternativePlugin"),
            icon: "strategy",
            show: true,
            onPress() {
                showDialog("RadioDialog", {
                    content: (pluginManager.getSortedPluginsWithAbility("getMediaSource").map(it => it.name)),
                    title: t("pluginSetting.pluginItem.dialog.setAlternativePluginTitle"),
                    defaultSelected: pluginManager.getAlternativePluginName(plugin) as any,
                    onOk(value) {
                        if (value === plugin.name) {
                            pluginManager.setAlternativePluginName(plugin, null as any);
                        } else {
                            pluginManager.setAlternativePluginName(plugin, value as any);
                        }
                        rerender();
                    },
                    tip: t("pluginSetting.pluginItem.dialog.setAlternativePluginTip"),

                });

            },
        },
        {
            title: t("pluginSetting.pluginItem.options.importMusic"),
            icon: "arrow-right-end-on-rectangle",
            onPress() {
                showPanel("SimpleInput", {
                    title: t("pluginSetting.pluginItem.options.importMusic"),
                    placeholder: t("pluginSetting.pluginItem.options.importMusicPlaceHolder"),
                    hints: plugin.instance.hints?.importMusicItem,
                    maxLength: 1000,
                    async onOk(text) {
                        const result = await plugin.methods.importMusicItem(
                            text,
                        );
                        if (result) {
                            showDialog("SimpleDialog", {
                                title: t("pluginSetting.pluginItem.options.importDialogTitle"),
                                content: t("pluginSetting.pluginItem.options.importMusicDialogContent", {
                                    name: result.title,
                                }),
                                onOk() {
                                    showPanel("AddToMusicSheet", {
                                        musicItem: result,
                                        newSheetDefaultName: t("pluginSetting.pluginItem.options.importMusicToSheetName", {
                                            name: plugin.name,
                                        }),
                                    });
                                },
                            });
                        } else {
                            Toast.warn(t("toast.failToImportMusic"));
                        }
                    },
                });
            },
            show: !!plugin.instance.importMusicItem,
        },
        {
            title: t("pluginSetting.pluginItem.options.importSheet"),
            icon: "arrow-right-end-on-rectangle",
            onPress() {
                showPanel("SimpleInput", {
                    title: t("pluginSetting.pluginItem.options.importSheet"),
                    placeholder: t("pluginSetting.pluginItem.options.importSheetPlaceHolder"),
                    hints: plugin.instance.hints?.importMusicSheet,
                    maxLength: 1000,
                    async onOk(text, closePanel) {
                        Toast.success(t("toast.importing"));
                        closePanel();
                        const result = await plugin.methods.importMusicSheet(
                            text,
                        );
                        if (result && result.length > 0) {
                            showDialog("SimpleDialog", {
                                title: t("pluginSetting.pluginItem.options.importDialogTitle"),
                                content: t("pluginSetting.pluginItem.options.importSheetDialogContent", {
                                    count: result.length,
                                }),
                                onOk() {
                                    showPanel("AddToMusicSheet", {
                                        musicItem: result,
                                    });
                                },
                            });
                        } else {
                            Toast.warn(t("toast.failToImportSheet"));
                        }
                    },
                });
            },
            show: !!plugin.instance.importMusicSheet,
        },
        {
            title: t("pluginSetting.pluginItem.options.userVariables"),
            icon: "code-bracket-square",
            onPress() {
                if (Array.isArray(plugin.instance.userVariables)) {
                    showPanel("SetUserVariables", {
                        async onOk(newValue, closePanel) {
                            pluginManager.setUserVariables(plugin, newValue);
                            Toast.success(t("toast.settingSuccess"));
                            closePanel();
                        },
                        variables: plugin.instance.userVariables,
                        initValues: pluginManager.getUserVariables(plugin),
                    });
                }
            },
            show: Array.isArray(plugin.instance.userVariables),
        },
    ];

    return (
        <View
            style={[
                styles.container,
                {
                    backgroundColor: colors.card,
                },
            ]}>
            <View style={styles.header}>
                <View style={styles.headerPluginContainer}>
                    <ThemeText
                        numberOfLines={1}
                        fontSize="title">
                        {plugin.name}
                    </ThemeText>
                    {
                        plugin.instance.description?.length ? <IconButton name='question-mark-circle' sizeType='light' onPress={() => {
                            showDialog("MarkdownDialog", {
                                title: plugin.name,
                                markdownContent: plugin.instance.description!,
                            });
                        }} /> : null
                    }

                </View>
                <ThemeSwitch
                    value={enabled}
                    onValueChange={val => {
                        pluginManager.setPluginEnabled(plugin, val);
                    }}
                />
            </View>
            <View style={styles.description}>
                <ThemeText fontSize="subTitle" fontColor="textSecondary">
                    {t("pluginSetting.pluginItem.versionHint", {
                        version: plugin.instance.version,
                    })}
                </ThemeText>
                {plugin.instance.author ? (
                    <ThemeText
                        fontSize="subTitle"
                        fontColor="textSecondary"
                        numberOfLines={1}
                        style={styles.author}>
                        {t("pluginSetting.pluginItem.author", {
                            author: plugin.instance.author,
                        })}
                    </ThemeText>
                ) : null}
            </View>
            {alternativePluginName ? <View style={styles.alternativePluginDescription}>
                <ThemeText fontSize="subTitle" fontColor="textSecondary">
                    {t("pluginSetting.pluginItem.alternativePlugin", {
                        name: alternativePluginName,
                    })}
                </ThemeText>
            </View> : null}
            <View style={styles.contents}>
                {options.map((it, index) =>
                    it.show !== false ? (
                        <IconTextButton
                            key={index}
                            icon={it.icon}
                            onPress={it.onPress}>
                            {it.title}
                        </IconTextButton>
                    ) : null,
                )}
            </View>
        </View>
        // <List.Accordion
        //     theme={{
        //         colors: {
        //             primary: colors.textHighlight,
        //         },
        //     }}
        //     style={{
        //         height: ITEM_HEIGHT_BIG,
        //     }}
        //     titleStyle={[
        //         {
        //             fontSize: fontSizeConst.title,
        //             fontWeight: fontWeightConst.semibold,
        //         },
        //         plugin.state === 'error' ? {color: 'red'} : undefined,
        //     ]}
        //     key={`plg-${plugin.hash}`}
        //     title={`${plugin.name}${
        //         plugin.instance.version ? `(${plugin.instance.version})` : ''
        //     }`}
        //     description={
        //         plugin.stateCode === PluginStateCode.VersionNotMatch
        //             ? '插件和app版本不兼容'
        //             : plugin.stateCode === PluginStateCode.CannotParse
        //             ? '无法解析插件'
        //             : undefined
        //     }>
        //     {options.map(_ =>
        //         _.show ? (
        //             <ListItem
        //                 withHorizontalPadding
        //                 key={`${plugin.hash}${_.title}`}
        //                 onPress={_.onPress}>
        //                 <ListItem.ListItemIcon icon={_.icon} />
        //                 <ListItem.Content title={_.title} />
        //             </ListItem>
        //         ) : null,
        //     )}
        // </List.Accordion>
    );
}

const PluginItem = memo(_PluginItem, (prev, curr) => {
    return prev.plugin === curr.plugin;
});
export default PluginItem;

const styles = StyleSheet.create({
    container: {
        flex: 1,
        borderRadius: rpx(8),
        marginHorizontal: rpx(24),
        paddingVertical: rpx(18),
        marginTop: rpx(36),
    },
    header: {
        paddingHorizontal: rpx(16),
        flexDirection: "row",
        alignItems: "center",
    },
    headerPluginContainer: {
        flexShrink: 1,
        flexGrow: 1,
        flexDirection: "row",
        gap: rpx(8),
        alignItems: "center",
    },
    author: {
        marginLeft: rpx(24),
        flexShrink: 1,
        flexGrow: 1,
    },
    description: {
        marginHorizontal: rpx(16),
        marginVertical: rpx(24),
        flexDirection: "row",
    },
    alternativePluginDescription: {
        marginHorizontal: rpx(16),
        marginBottom: rpx(24),
        flexDirection: "row",
    },
    contents: {
        flexDirection: "row",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: rpx(16),
    },
});
