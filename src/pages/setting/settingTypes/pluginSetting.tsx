import React, {useState} from 'react';
import {FlatList, StyleSheet, View} from 'react-native';
import rpx from '@/utils/rpx';
import {AnimatedFAB, List} from 'react-native-paper';
import DocumentPicker from 'react-native-document-picker';
import Loading from '@/components/base/loading';
import ListItem from '@/components/base/listItem';

import useDialog from '@/components/dialogs/useDialog';
import useColors from '@/hooks/useColors';
import {fontSizeConst, fontWeightConst} from '@/constants/uiConst';
import PluginManager, {Plugin} from '@/core/pluginManager';
import {trace} from '@/utils/log';
import usePanel from '@/components/panels/usePanel';
import Toast from '@/utils/toast';

export default function PluginSetting() {
    const plugins = PluginManager.usePlugins();
    const [loading, setLoading] = useState(false);
    const colors = useColors();

    return (
        <View style={style.wrapper}>
            {loading ? (
                <Loading />
            ) : (
                <FlatList
                    data={plugins ?? []}
                    keyExtractor={_ => _.hash}
                    renderItem={({item: plugin}) => (
                        <PluginView key={plugin.hash} plugin={plugin} />
                    )}
                />
            )}
            <AnimatedFAB
                icon="plus"
                animateFrom={'right'}
                onPress={async () => {
                    try {
                        const result = await DocumentPicker.pickMultiple();
                        setLoading(true);
                        // 初步过滤
                        const validResult = result?.filter(_ =>
                            _.uri.endsWith('.js'),
                        );
                        console.log(result);
                        await Promise.all(
                            validResult.map(_ =>
                                PluginManager.installPlugin(_.uri),
                            ),
                        );
                        Toast.success('插件安装成功~');
                    } catch (e: any) {
                        trace('插件安装失败', e?.message);
                        Toast.warn(`插件安装失败: ${e?.message ?? ''}`);
                    }
                    setLoading(false);
                }}
                extended
                iconMode="dynamic"
                style={[style.fab, {backgroundColor: colors.primary}]}
                label="添加插件"
            />
        </View>
    );
}

const style = StyleSheet.create({
    wrapper: {
        width: rpx(750),
        padding: rpx(24),
        paddingTop: rpx(36),
        flex: 1,
    },
    header: {
        marginBottom: rpx(24),
    },
    fab: {
        position: 'absolute',
        right: rpx(48),
        bottom: rpx(96),
        fontSize: fontSizeConst.content,
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
            title: '卸载插件',
            icon: 'trash-can-outline',
            show: true,
            onPress() {
                showDialog('SimpleDialog', {
                    title: '卸载插件',
                    content: `确认卸载插件${plugin.name}吗`,
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
            icon: 'trash-can-outline',
            onPress() {
                showPanel('SimpleInput', {
                    placeholder: '输入目标歌曲',
                    maxLength: 1000,
                    async onOk(text) {
                        const result = await plugin.methods.importMusicItem(
                            text,
                        );
                        console.log(result);
                        if (result) {
                            showDialog('SimpleDialog', {
                                title: '准备导入',
                                content: `发现歌曲 ${result.title} ! 现在开始导入吗?`,
                                onOk() {
                                    showPanel('AddToMusicSheet', {
                                        musicItem: result,
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
            icon: 'trash-can-outline',
            onPress() {
                showPanel('SimpleInput', {
                    placeholder: '输入目标歌单',
                    maxLength: 1000,
                    async onOk(text) {
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
                            Toast.warn('目标歌单是空的哦');
                        }
                    },
                });
            },
            show: !!plugin.instance.importMusicSheet,
        },
    ];

    return (
        <List.Accordion
            theme={{
                colors: {
                    primary: colors.textHighlight,
                },
            }}
            titleStyle={{
                fontSize: fontSizeConst.title,
                fontWeight: fontWeightConst.semibold,
            }}
            title={plugin.name}>
            {options.map(_ =>
                _.show ? (
                    <ListItem
                        key={`${plugin.hash}${_.title}`}
                        left={{icon: {name: _.icon}}}
                        title={_.title}
                        onPress={_.onPress}
                    />
                ) : (
                    <></>
                ),
            )}
        </List.Accordion>
    );
}
