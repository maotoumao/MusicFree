import React, {useState} from 'react';
import {FlatList, StyleSheet, View} from 'react-native';
import rpx from '@/utils/rpx';
import * as DocumentPicker from 'expo-document-picker';
import Loading from '@/components/base/loading';

import PluginManager from '@/core/pluginManager';
import {trace} from '@/utils/log';

import Toast from '@/utils/toast';
import axios from 'axios';
import {useNavigation} from '@react-navigation/native';
import Config from '@/core/config';
import Empty from '@/components/base/empty';
import HorizontalSafeAreaView from '@/components/base/horizontalSafeAreaView.tsx';
import {showDialog} from '@/components/dialogs/useDialog';
import {showPanel} from '@/components/panels/usePanel';
import AppBar from '@/components/base/appBar';
import Fab from '@/components/base/fab';
import PluginItem from '../components/pluginItem';
import {IIconName} from '@/components/base/icon.tsx';
import {readAsStringAsync} from 'expo-file-system';

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
                    const code = await readAsStringAsync(it.uri);
                    await PluginManager.installPluginFromRawCode(code, {
                        notCheckVersion: Config.get(
                            'setting.basic.notCheckPluginVersion',
                        ),
                    });
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
            maxLength: 120,
            async onOk(text, closePanel) {
                setLoading(true);
                closePanel();

                const result = await installPluginFromUrl(text.trim());

                if (result?.code === 'success') {
                    Toast.success('插件安装成功');
                } else {
                    Toast.warn(`部分插件安装失败: ${result.message ?? ''}`);
                }
                setLoading(false);
            },
        });
    }

    async function onSubscribeClick() {
        const urls = Config.get('setting.plugin.subscribeUrl');
        if (!urls) {
            Toast.warn('暂无订阅');
        }
        setLoading(true);
        try {
            const urlItems = JSON.parse(urls!);
            let code = 'success';
            if (Array.isArray(urlItems)) {
                for (let i = 0; i < urlItems.length; ++i) {
                    const result = await installPluginFromUrl(urlItems[i].url);
                    if (result.code === 'fail') {
                        code = result.message ?? 'fail';
                    }
                }
            } else {
                throw new Error();
            }
            if (code !== 'success') {
                Toast.warn(`部分插件安装失败: ${code ?? ''}`);
            } else {
                Toast.success('插件安装成功');
            }
        } catch {
            if (urls?.length) {
                const result = await installPluginFromUrl(urls);
                if (result.code === 'success') {
                    Toast.success('插件安装成功');
                } else {
                    Toast.warn(`部分插件安装失败: ${result.message ?? ''}`);
                }
            } else {
                Toast.warn('订阅无效');
            }
        }
        setLoading(false);
    }

    async function onUpdateAllClick() {
        const plugins = PluginManager.getValidPlugins();
        setLoading(true);
        try {
            let code = 'success';
            for (let i = 0; i < plugins.length; ++i) {
                const srcUrl = plugins[i].instance.srcUrl;
                if (srcUrl) {
                    const result = await installPluginFromUrl(srcUrl);
                    if (result.code === 'fail') {
                        code = result.message ?? 'fail';
                    }
                }
            }

            if (code !== 'success') {
                Toast.warn(`部分插件安装失败: ${code ?? ''}`);
            } else {
                Toast.success('插件更新成功');
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
                            renderItem={({item: plugin}) => (
                                <PluginItem key={plugin.hash} plugin={plugin} />
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

interface IInstallResult {
    code: 'success' | 'fail';
    message?: string;
}

const reqHeaders = {
    'Cache-Control': 'no-cache',
    Pragma: 'no-cache',
    Expires: '0',
};

async function installPluginFromUrl(text: string): Promise<IInstallResult> {
    try {
        let urls: string[] = [];
        const iptUrl = text.trim();
        if (text.endsWith('.json')) {
            const jsonFile = (
                await axios.get(iptUrl, {
                    headers: reqHeaders,
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
            urls = [iptUrl];
        }
        const failedPlugins: Array<string> = [];
        await Promise.all(
            urls.map(url =>
                PluginManager.installPluginFromUrl(url, {
                    notCheckVersion: Config.get(
                        'setting.basic.notCheckPluginVersion',
                    ),
                }).catch(e => {
                    failedPlugins.push(e?.message ?? '');
                }),
            ),
        );
        if (failedPlugins.length) {
            throw new Error(failedPlugins.join('\n'));
        }
        return {
            code: 'success',
        };
    } catch (e: any) {
        return {
            code: 'fail',
            message: e?.message,
        };
    }
}
