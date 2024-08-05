import React from 'react';
import {View} from 'react-native';
import {vmax} from '@/utils/rpx';
import ListItem from '@/components/base/listItem';
import Toast from '@/utils/toast';

import {useSafeAreaInsets} from 'react-native-safe-area-context';
import PanelBase from '../base/panelBase';
import {FlatList} from 'react-native-gesture-handler';
import {showPanel} from '../usePanel';
import PanelHeader from '../base/panelHeader';
import PluginManager from '@/core/pluginManager';
import NoPlugin from '@/components/base/noPlugin';
import globalStyle from '@/constants/globalStyle';
import {showDialog} from '@/components/dialogs/useDialog';

export default function ImportMusicSheet() {
    const plugins = PluginManager.useSortedPlugins() || [];

    const validPlugins = plugins.filter(it => !!it.instance?.importMusicSheet);

    const safeAreaInsets = useSafeAreaInsets();

    return (
        <PanelBase
            height={vmax(60)}
            renderBody={() => (
                <>
                    <PanelHeader hideButtons title={'导入歌单'} />
                    {validPlugins.length ? (
                        <View style={globalStyle.fwflex1}>
                            <FlatList
                                data={validPlugins}
                                keyExtractor={plugin => plugin.hash}
                                style={{
                                    marginBottom: safeAreaInsets.bottom,
                                }}
                                renderItem={({item: plugin}) => (
                                    <ListItem
                                        withHorizontalPadding
                                        key={`${plugin.hash}`}
                                        onPress={async () => {
                                            showPanel('SimpleInput', {
                                                title: '导入歌单',
                                                placeholder: '输入目标歌单',
                                                hints: plugin.instance.hints
                                                    ?.importMusicSheet,
                                                maxLength: 1000,
                                                async onOk(text, closePanel) {
                                                    Toast.success(
                                                        '正在导入中...',
                                                    );
                                                    closePanel();
                                                    const result =
                                                        await plugin.methods.importMusicSheet(
                                                            text,
                                                        );
                                                    if (result.length > 0) {
                                                        showDialog(
                                                            'SimpleDialog',
                                                            {
                                                                title: '准备导入',
                                                                content: `发现${result.length}首歌曲! 现在开始导入吗?`,
                                                                onOk() {
                                                                    showPanel(
                                                                        'AddToMusicSheet',
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
                                                            '链接有误或目标歌单为空',
                                                        );
                                                    }
                                                },
                                            });
                                        }}>
                                        <ListItem.Content title={plugin.name} />
                                    </ListItem>
                                )}
                            />
                        </View>
                    ) : (
                        <NoPlugin notSupportType="导入歌单" />
                    )}
                </>
            )}
        />
    );
}
