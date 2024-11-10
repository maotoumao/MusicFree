import React from 'react';

import useColors from '@/hooks/useColors';
import PluginManager, {Plugin} from '@/core/pluginManager';

import Toast from '@/utils/toast';
import Clipboard from '@react-native-clipboard/clipboard';
import {showDialog} from '@/components/dialogs/useDialog';
import {showPanel} from '@/components/panels/usePanel';
import rpx from '@/utils/rpx';
import {StyleSheet, View} from 'react-native';
import ThemeText from '@/components/base/themeText';
import IconTextButton from '@/components/base/iconTextButton';
import {PluginMeta} from '@/core/pluginMeta';
import ThemeSwitch from '@/components/base/switch';
import {IIconName} from '@/components/base/icon.tsx';

interface IPluginItemProps {
    plugin: Plugin;
}

interface IOption {
    title: string;
    icon: IIconName;
    onPress?: () => void;
    show?: boolean;
}

export default function PluginItem(props: IPluginItemProps) {
    const {plugin} = props;
    const colors = useColors();

    const options: IOption[] = [
        {
            title: '更新插件',
            icon: 'arrow-path',
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
            icon: 'trash-outline',
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
        {
            title: '导入单曲',
            icon: 'arrow-right-end-on-rectangle',
            onPress() {
                showPanel('SimpleInput', {
                    title: '导入单曲',
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
            icon: 'arrow-right-end-on-rectangle',
            onPress() {
                showPanel('SimpleInput', {
                    title: '导入歌单',
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
            title: '用户变量',
            icon: 'code-bracket-square',
            onPress() {
                if (Array.isArray(plugin.instance.userVariables)) {
                    showPanel('SetUserVariables', {
                        async onOk(newValue, closePanel) {
                            await PluginMeta.setPluginMetaProp(
                                plugin,
                                'userVariables',
                                newValue,
                            );
                            Toast.success('设置成功~');
                            closePanel();
                        },
                        variables: plugin.instance.userVariables,
                        initValues:
                            PluginMeta.getPluginMeta(plugin)?.userVariables,
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
                <ThemeText
                    style={styles.headerPluginName}
                    numberOfLines={1}
                    fontSize="title">
                    {plugin.name}
                </ThemeText>
                <ThemeSwitch
                    value={plugin.state !== 'disabled'}
                    onValueChange={val => {
                        PluginManager.setPluginEnabled(plugin, val);
                    }}
                />
            </View>
            <View style={styles.description}>
                <ThemeText fontSize="subTitle" fontColor="textSecondary">
                    版本号: {plugin.instance.version}
                </ThemeText>
                {plugin.instance.author ? (
                    <ThemeText
                        fontSize="subTitle"
                        fontColor="textSecondary"
                        numberOfLines={1}
                        style={styles.author}>
                        作者: {plugin.instance.author}
                    </ThemeText>
                ) : null}
            </View>
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
        flexDirection: 'row',
        alignItems: 'center',
    },
    headerPluginName: {
        flexShrink: 1,
        flexGrow: 1,
    },
    author: {
        marginLeft: rpx(24),
        flexShrink: 1,
        flexGrow: 1,
    },
    description: {
        marginHorizontal: rpx(16),
        marginVertical: rpx(24),
        flexDirection: 'row',
    },
    contents: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: rpx(16),
    },
});
