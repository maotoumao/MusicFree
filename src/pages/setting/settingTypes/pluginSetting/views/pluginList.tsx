import React, {useState} from 'react';
import {FlatList, StyleSheet} from 'react-native';
import rpx from '@/utils/rpx';
import {FAB, List} from 'react-native-paper';
import DocumentPicker from 'react-native-document-picker';
import Loading from '@/components/base/loading';
import ListItem from '@/components/base/listItem';

import useDialog from '@/components/dialogs/useDialog';
import useColors from '@/hooks/useColors';
import {fontSizeConst, fontWeightConst} from '@/constants/uiConst';
import PluginManager, {Plugin, PluginStateCode} from '@/core/pluginManager';
import {trace} from '@/utils/log';
import usePanel from '@/components/panels/usePanel';
import Toast from '@/utils/toast';
import axios from 'axios';
import {addRandomHash} from '@/utils/fileUtils';
import ComplexAppBar from '@/components/base/ComplexAppBar';
import {useNavigation} from '@react-navigation/native';
import Clipboard from '@react-native-clipboard/clipboard';
import Config from '@/core/config';
import Empty from '@/components/base/empty';
import HorizonalSafeAreaView from '@/components/base/horizonalSafeAreaView';

const ITEM_HEIGHT_BIG = rpx(120);

export default function PluginList() {
    const plugins = PluginManager.useSortedPlugins();
    const [loading, setLoading] = useState(false);
    const [fabOpen, setFabOpen] = useState(false);
    const colors = useColors();
    const {showPanel} = usePanel();
    const {showDialog} = useDialog();

    const navigator = useNavigation<any>();

    const menuOptions = [
        {
            icon: 'book-plus-multiple-outline',
            title: '订阅设置',
            async onPress() {
                navigator.navigate('/pluginsetting/subscribe');
            },
        },
        {
            icon: 'menu',
            title: '插件排序',
            onPress() {
                navigator.navigate('/pluginsetting/sort');
            },
        },
        {
            icon: 'trash-can-outline',
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

    const fabActions = [
        {
            icon: 'file-plus',
            label: '从本地安装插件',
            async onPress() {
                try {
                    const result = await DocumentPicker.pickMultiple();
                    setLoading(true);
                    // 初步过滤
                    const validResult = result?.filter(
                        _ => _.uri.endsWith('.js') || _.name?.endsWith('.js'),
                    );
                    await Promise.all(
                        validResult.map(_ =>
                            PluginManager.installPlugin(_.uri),
                        ),
                    );
                    Toast.success('插件安装成功~');
                } catch (e: any) {
                    if (e?.message?.startsWith('User')) {
                        setLoading(false);
                        return;
                    }
                    trace('插件安装失败', e?.message);
                    Toast.warn(`插件安装失败: ${e?.message ?? ''}`);
                }
                setLoading(false);
            },
        },
        {
            icon: 'link-variant-plus',
            label: '从网络安装插件',
            async onPress() {
                showPanel('SimpleInput', {
                    placeholder: '输入插件URL',
                    maxLength: 120,
                    async onOk(text, closePanel) {
                        setLoading(true);
                        closePanel();
                        const result = await installPluginFromUrl(text.trim());
                        if (result.code === 'success') {
                            Toast.success('插件安装成功');
                        } else {
                            Toast.warn(
                                `部分插件安装失败: ${result.message ?? ''}`,
                            );
                        }
                        setLoading(false);
                    },
                });
            },
        },
        {
            icon: 'update',
            label: '更新订阅',
            async onPress() {
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
                            const result = await installPluginFromUrl(
                                urlItems[i].url,
                            );
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
                            Toast.warn(
                                `部分插件安装失败: ${result.message ?? ''}`,
                            );
                        }
                    } else {
                        Toast.warn('订阅无效');
                    }
                }
                setLoading(false);
            },
        },
    ];

    return (
        <>
            <ComplexAppBar title="插件设置" menuOptions={menuOptions} />
            <HorizonalSafeAreaView style={style.wrapper}>
                <>
                    {loading ? (
                        <Loading />
                    ) : (
                        <FlatList
                            ListEmptyComponent={Empty}
                            data={plugins ?? []}
                            keyExtractor={_ => _.hash}
                            renderItem={({item: plugin}) => (
                                <PluginView key={plugin.hash} plugin={plugin} />
                            )}
                        />
                    )}
                    <FAB.Group
                        visible
                        open={fabOpen}
                        icon={fabOpen ? 'close' : 'plus'}
                        color={colors.text}
                        fabStyle={{backgroundColor: colors.primary}}
                        actions={fabActions}
                        onStateChange={({open}) => {
                            setFabOpen(open);
                        }}
                    />
                </>
            </HorizonalSafeAreaView>
        </>
    );
}

const style = StyleSheet.create({
    wrapper: {
        width: '100%',
        paddingTop: rpx(36),
        flex: 1,
    },
    header: {
        marginBottom: rpx(24),
    },
});

interface IPluginViewProps {
    plugin: Plugin;
}
function PluginView(props: IPluginViewProps) {
    const {plugin} = props;
    const colors = useColors();
    const {showDialog} = useDialog();
    const {showPanel} = usePanel();
    const options = [
        {
            title: '导入单曲',
            icon: 'import',
            onPress() {
                showPanel('SimpleInput', {
                    placeholder: '输入目标歌曲',
                    hints: plugin.instance.hints?.importMusicItem,
                    maxLength: 1000,
                    async onOk(text) {
                        const result = await plugin.methods.importMusicItem(
                            text,
                        );
                        if (result) {
                            showDialog('SimpleDialog', {
                                title: '准备导入',
                                content: `发现歌曲 ${result.title} ! 现在开始导入吗?`,
                                onOk() {
                                    showPanel('AddToMusicSheet', {
                                        musicItem: result,
                                        newSheetDefaultName: `${plugin.name}导入歌曲`,
                                    });
                                },
                            });
                        } else {
                            Toast.warn('无法导入~');
                        }
                    },
                });
            },
            show: !!plugin.instance.importMusicItem,
        },
        {
            title: '导入歌单',
            icon: 'database-import-outline',
            onPress() {
                showPanel('SimpleInput', {
                    placeholder: '输入目标歌单',
                    hints: plugin.instance.hints?.importMusicSheet,
                    maxLength: 1000,
                    async onOk(text, closePanel) {
                        Toast.success('正在导入中...');
                        closePanel();
                        const result = await plugin.methods.importMusicSheet(
                            text,
                        );
                        if (result.length > 0) {
                            showDialog('SimpleDialog', {
                                title: '准备导入',
                                content: `发现${result.length}首歌曲! 现在开始导入吗?`,
                                onOk() {
                                    showPanel('AddToMusicSheet', {
                                        musicItem: result,
                                    });
                                },
                            });
                        } else {
                            Toast.warn('链接有误或目标歌单为空');
                        }
                    },
                });
            },
            show: !!plugin.instance.importMusicSheet,
        },
        {
            title: '更新插件',
            icon: 'update',
            async onPress() {
                try {
                    await PluginManager.updatePlugin(plugin);
                    Toast.success('已更新到最新版本');
                } catch (e: any) {
                    Toast.warn(e?.message ?? '更新失败');
                }
            },
            show: !!plugin.instance.srcUrl,
        },
        {
            title: '分享插件',
            icon: 'share',
            async onPress() {
                try {
                    Clipboard.setString(plugin.instance.srcUrl!);
                    Toast.success('已复制到剪切板');
                } catch (e: any) {
                    Toast.warn(e?.message ?? '分享失败');
                }
            },
            show: !!plugin.instance.srcUrl,
        },
        {
            title: '卸载插件',
            icon: 'trash-can-outline',
            show: true,
            onPress() {
                showDialog('SimpleDialog', {
                    title: '卸载插件',
                    content: `确认卸载插件「${plugin.name}」吗`,
                    async onOk() {
                        try {
                            await PluginManager.uninstallPlugin(plugin.hash);
                            Toast.success('卸载成功~');
                        } catch {
                            Toast.warn('卸载失败');
                        }
                    },
                });
            },
        },
    ];

    return (
        <List.Accordion
            theme={{
                colors: {
                    primary: colors.textHighlight,
                },
            }}
            style={{
                height: ITEM_HEIGHT_BIG,
            }}
            titleStyle={[
                {
                    fontSize: fontSizeConst.title,
                    fontWeight: fontWeightConst.semibold,
                },
                plugin.state === 'error' ? {color: 'red'} : undefined,
            ]}
            key={`plg-${plugin.hash}`}
            title={`${plugin.name}${
                plugin.instance.version ? `(${plugin.instance.version})` : ''
            }`}
            description={
                plugin.stateCode === PluginStateCode.VersionNotMatch
                    ? '插件和app版本不兼容'
                    : plugin.stateCode === PluginStateCode.CannotParse
                    ? '无法解析插件'
                    : undefined
            }>
            {options.map(_ =>
                _.show ? (
                    <ListItem
                        itemHeight={ITEM_HEIGHT_BIG}
                        key={`${plugin.hash}${_.title}`}
                        left={{icon: {name: _.icon}}}
                        title={_.title}
                        onPress={_.onPress}
                    />
                ) : null,
            )}
        </List.Accordion>
    );
}

interface IInstallResult {
    code: 'success' | 'fail';
    message?: string;
}
async function installPluginFromUrl(text: string): Promise<IInstallResult> {
    try {
        let urls: string[] = [];
        const iptUrl = addRandomHash(text.trim());
        if (text.endsWith('.json')) {
            const jsonFile = (await axios.get(iptUrl)).data;
            /**
             * {
             *     plugins: [{
             *          version: xxx,
             *          url: xxx
             *      }]
             * }
             */
            urls = (jsonFile?.plugins ?? []).map((_: any) =>
                addRandomHash(_.url),
            );
        } else {
            urls = [iptUrl];
        }
        const failedPlugins: Array<string> = [];
        await Promise.all(
            urls.map(url =>
                PluginManager.installPluginFromUrl(url).catch(e => {
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
