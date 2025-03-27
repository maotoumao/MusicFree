import React, { useState } from "react";
import { FlatList, StyleSheet, View } from "react-native";
import rpx from "@/utils/rpx";
import * as DocumentPicker from "expo-document-picker";
import Loading from "@/components/base/loading";

import PluginManager, { IInstallPluginResult } from "@/core/pluginManager";
import { trace } from "@/utils/log";

import Toast from "@/utils/toast";
import axios from "axios";
import { useNavigation } from "@react-navigation/native";
import Config from "@/core/config.ts";
import Empty from "@/components/base/empty";
import HorizontalSafeAreaView from "@/components/base/horizontalSafeAreaView.tsx";
import { showDialog } from "@/components/dialogs/useDialog";
import { showPanel } from "@/components/panels/usePanel";
import AppBar from "@/components/base/appBar";
import Fab from "@/components/base/fab";
import PluginItem from "../components/pluginItem";
import { IIconName } from "@/components/base/icon.tsx";

interface IOption {
    icon: IIconName;
    title: string;
    onPress?: () => void;
}

export default function PluginList() {
    const plugins = PluginManager.useSortedPlugins();
    const [loading, setLoading] = useState(false);

    const navigator = useNavigation<any>();

    const menuOptions: IOption[] = [
        {
            icon: 'bookmark-square',
            title: '订阅设置',
            async onPress() {
                navigator.navigate('/pluginsetting/subscribe');
            },
        },
        {
            icon: 'bars-3',
            title: '插件排序',
            onPress() {
                navigator.navigate('/pluginsetting/sort');
            },
        },
        {
            icon: 'trash-outline',
            title: '卸载全部插件',
            onPress() {
                showDialog('SimpleDialog', {
                    title: '卸载插件',
                    content: '确认卸载全部插件吗？此操作不可恢复！',
                    async onOk() {
                        setLoading(true);
                        await PluginManager.uninstallAllPlugins();
                        setLoading(false);
                    },
                });
            },
        },
    ];

    async function onInstallFromLocalClick() {
        try {
            const results = await DocumentPicker.getDocumentAsync({
                copyToCacheDirectory: true,
                multiple: true,
                type: ['application/javascript', 'text/javascript'],
            });
            if (results.canceled) {
                // 用户取消
                return;
            }
            setLoading(true);

            await Promise.all(
                results.assets.map(async it => {
                    await PluginManager.installPluginFromLocalFile(it.uri, {
                        notCheckVersion: Config.getConfig(
                            'basic.notCheckPluginVersion',
                        ),
                        useExpoFs: true
                    })
                }),
            );
            // 初步过滤

            Toast.success('插件安装成功~');
        } catch (e: any) {
            trace('插件安装失败', e?.message);
            Toast.warn(`插件安装失败: ${e?.message ?? ''}`);
        }
        setLoading(false);
    }

    async function onInstallFromNetworkClick() {
        showPanel('SimpleInput', {
            title: '安装插件',
            placeholder: '输入插件URL',
            maxLength: 200,
            async onOk(text, closePanel) {
                setLoading(true);
                closePanel();

                const result = await installPluginFromUrl(text.trim());

                // 检查是否全部安装成功
                const successResults: IInstallPluginResult[] = [];
                const failResults: IInstallPluginResult[] = [];
                for (let i = 0; i < result.length; ++i) {
                    if (result[i].success) {
                        successResults.push(result[i]);
                    } else {
                        failResults.push(result[i]);
                    }
                }

                if (!failResults.length) {
                    Toast.success('插件安装成功');
                } else {
                    Toast.warn((successResults.length ? "部分" : "全部") + "插件安装失败", {
                        'type': 'warn',
                        'actionText': "查看",
                        'onActionClick': () => {
                            showDialog('SimpleDialog', {
                                title: "插件安装失败",
                                content: "以下插件安装失败: \n" + failResults.map(it => (it.pluginUrl ?? "") + "\n失败原因：" + it.message).join('\n-----\n'),
                            })
                        }
                    });
                }


                setLoading(false);
            },
        });
    }

    async function onSubscribeClick() {
        const urls = Config.getConfig('plugin.subscribeUrl');
        if (!urls) {
            Toast.warn('暂无订阅');
        }
        setLoading(true);

        const successResults: IInstallPluginResult[] = [];
        const failResults: IInstallPluginResult[] = [];

        try {
            const urlItems = JSON.parse(urls!);
            if (Array.isArray(urlItems)) {
                for (let i = 0; i < urlItems.length; ++i) {
                    const result = await installPluginFromUrl(urlItems[i].url);
                    if (result[0]) {
                        if (result[0].success) {
                            successResults.push(result[0]);
                        } else {
                            failResults.push(result[0]);
                        }
                    }
                }
            } else {
                throw new Error();
            }

            if (!failResults.length) {
                Toast.success('插件安装成功');
            } else {
                Toast.warn((successResults.length ? "部分" : "全部") + "插件安装失败", {
                    'type': 'warn',
                    'actionText': "查看",
                    'onActionClick': () => {
                        showDialog('SimpleDialog', {
                            title: "插件安装失败",
                            content: "以下插件安装失败: \n" + failResults.map(it => (it.pluginUrl ?? "") + "\n失败原因：" + it.message).join('\n-----\n'),
                        })
                    }
                });
            }

        } catch {
            if (urls?.length) {
                const result = await installPluginFromUrl(urls);
                if (result[0]) {
                    if (result[0].success) {
                        Toast.success('插件安装成功');
                    } else {
                        Toast.warn(`部分插件安装失败: ${result[0].message ?? ''}`);
                    }
                } else {
                    Toast.warn('订阅无效');
                }
            }
            setLoading(false);
        }
    }

    async function onUpdateAllClick() {
        const plugins = PluginManager.getValidPlugins();
        setLoading(true);

        const successResults: IInstallPluginResult[] = [];
        const failResults: IInstallPluginResult[] = [];

        try {
            for (let i = 0; i < plugins.length; ++i) {
                const srcUrl = plugins[i].instance.srcUrl;
                if (srcUrl) {
                    const result = await installPluginFromUrl(srcUrl);
                    if (result[0]) {
                        if (result[0].success) {
                            successResults.push(result[0]);
                        } else {
                            failResults.push(result[0]);
                        }
                    }
                }
            }

            if (!failResults.length) {
                Toast.success('插件更新成功');
            } else {
                Toast.warn((successResults.length ? "部分" : "全部") + "插件更新失败", {
                    'type': 'warn',
                    'actionText': "查看",
                    'onActionClick': () => {
                        showDialog('SimpleDialog', {
                            title: "插件更新失败",
                            content: "以下插件更新失败: \n" + failResults.map(it => (it.pluginUrl ?? "") + "\n失败原因：" + it.message).join('\n-----\n'),
                        })
                    }
                });
            }

        } catch (e: any) {
            Toast.warn(`出现未知错误: ${e.message ?? e}`);
        }
        setLoading(false);
    }

    return (
        <>
            <AppBar menu={menuOptions}>插件管理</AppBar>
            <HorizontalSafeAreaView style={style.wrapper}>
                <>
                    {loading ? (
                        <Loading />
                    ) : (
                        <FlatList
                            ListEmptyComponent={Empty}
                            ListFooterComponent={<View style={style.blank} />}
                            data={plugins ?? []}
                            keyExtractor={_ => _.hash}
                            renderItem={({ item: plugin }) => (
                                <PluginItem key={plugin.hash} plugin={plugin} enabled={plugin.state === 'enabled'} />
                            )}
                        />
                    )}

                    <Fab
                        icon="plus"
                        onPress={() => {
                            showPanel('SimpleSelect', {
                                header: '安装插件',
                                candidates: [
                                    {
                                        value: '从本地安装插件',
                                    },
                                    {
                                        value: '从网络安装插件',
                                    },
                                    {
                                        value: '更新全部插件',
                                    },
                                    {
                                        value: '更新订阅',
                                    },
                                ],
                                onPress(item) {
                                    if (item.value === '从本地安装插件') {
                                        onInstallFromLocalClick();
                                    } else if (
                                        item.value === '从网络安装插件'
                                    ) {
                                        onInstallFromNetworkClick();
                                    } else if (item.value === '更新订阅') {
                                        onSubscribeClick();
                                    } else if (item.value === '更新全部插件') {
                                        onUpdateAllClick();
                                    }
                                },
                            });
                        }}
                    />
                </>
            </HorizontalSafeAreaView>
        </>
    );
}

const style = StyleSheet.create({
    wrapper: {
        width: '100%',
        flex: 1,
    },
    blank: {
        height: rpx(200),
    },
});



async function installPluginFromUrl(text: string): Promise<IInstallPluginResult[]> {
    try {
        let urls: string[] = [];
        const inputUrl = text.trim();
        if (text.endsWith('.json')) {
            const jsonFile = (
                await axios.get(inputUrl, {
                    headers: {
                        'Cache-Control': 'no-cache',
                        Pragma: 'no-cache',
                        Expires: '0',
                    },
                })
            ).data;
            /**
             * {
             *     plugins: [{
             *          version: xxx,
             *          url: xxx
             *      }]
             * }
             */
            urls = (jsonFile?.plugins ?? []).map((_: any) => _.url);
        } else {
            urls = [inputUrl];
        }
        return await Promise.all(
            urls.map(url =>
                PluginManager.installPluginFromUrl(url, {
                    notCheckVersion: Config.getConfig(
                        'basic.notCheckPluginVersion',
                    ),
                }),
            ),
        );
    } catch (e: any) {
        return [{ success: false, message: e?.message, pluginUrl: text }];
    }
}
