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
                        <PluginView plugin={plugin} />
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
                        await Promise.allSettled(
                            validResult.map(_ =>
                                PluginManager.installPlugin(_.uri),
                            ),
                        );
                    } catch (e) {
                        console.log(e, '寄了');
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
    const options = [
        {
            title: '卸载插件',
            icon: 'trash-can-outline',
            show: true,
            onPress() {
                showDialog('SimpleDialog', {
                    title: '卸载插件',
                    content: `确认卸载插件${plugin.instance.platform}吗`,
                    async onOk() {
                        try {
                            await PluginManager.uninstallPlugin(plugin.hash);
                        } catch {}
                    },
                });
            },
        },
        {
            title: '导入歌单',
            icon: 'trash-can-outline',
            onPress() {
                console.log(plugin.instance.defaultSearchType);
            },
            show: !!plugin.instance.defaultSearchType,
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
