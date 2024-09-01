import React, {useEffect, useState} from 'react';
import {StyleSheet} from 'react-native';
import rpx from '@/utils/rpx';
import Config from '@/core/config';
import {FlatList} from 'react-native-gesture-handler';
import Empty from '@/components/base/empty';
import ListItem from '@/components/base/listItem';
import Toast from '@/utils/toast';
import Clipboard from '@react-native-clipboard/clipboard';
import HorizontalSafeAreaView from '@/components/base/horizontalSafeAreaView.tsx';
import globalStyle from '@/constants/globalStyle';
import {showDialog} from '@/components/dialogs/useDialog';
import AppBar from '@/components/base/appBar';
import Fab from '@/components/base/fab';

interface ISubscribeItem {
    name: string;
    url: string;
}

const ITEM_HEIGHT = rpx(108);

export default function PluginSubscribe() {
    const urls = Config.useConfig('setting.plugin.subscribeUrl') ?? '';
    const [subscribes, setSubscribes] = useState<Array<ISubscribeItem>>([]);

    useEffect(() => {
        try {
            const parsed = JSON.parse(urls);
            if (Array.isArray(parsed)) {
                setSubscribes(parsed);
            } else {
                throw new Error();
            }
        } catch {
            if (urls.length) {
                setSubscribes([
                    {
                        name: '默认',
                        url: urls,
                    },
                ]);
            } else {
                setSubscribes([]);
            }
        }
    }, [urls]);

    const onSubmit = (
        subscribeItem: ISubscribeItem,
        hideDialog: () => void,
        editingIndex?: number,
    ) => {
        if (
            subscribeItem.url.endsWith('.js') ||
            subscribeItem.url.endsWith('.json')
        ) {
            if (editingIndex !== undefined) {
                Config.set(
                    'setting.plugin.subscribeUrl',
                    JSON.stringify([
                        ...subscribes.slice(0, editingIndex),
                        subscribeItem,
                        ...subscribes.slice(editingIndex + 1),
                    ]),
                );
            } else {
                Config.set(
                    'setting.plugin.subscribeUrl',
                    JSON.stringify([...subscribes, subscribeItem]),
                );
            }
            hideDialog();
        } else {
            Toast.warn('订阅地址必须以.js或.json结尾');
        }
    };

    return (
        <>
            <AppBar>订阅设置</AppBar>
            <HorizontalSafeAreaView style={globalStyle.flex1}>
                <FlatList
                    style={style.listWrapper}
                    ListEmptyComponent={Empty}
                    data={subscribes}
                    renderItem={({item, index}) => {
                        return (
                            <ListItem
                                withHorizontalPadding
                                onPress={() => {
                                    showDialog('SubscribePluginDialog', {
                                        subscribeItem: item,
                                        onSubmit,
                                        editingIndex: index,
                                        onDelete(editingIndex, hideDialog) {
                                            Config.set(
                                                'setting.plugin.subscribeUrl',
                                                JSON.stringify([
                                                    ...subscribes.slice(
                                                        0,
                                                        editingIndex,
                                                    ),
                                                    ...subscribes.slice(
                                                        editingIndex + 1,
                                                    ),
                                                ]),
                                            );
                                            hideDialog();
                                            Toast.success('删除成功');
                                        },
                                    });
                                }}>
                                <ListItem.Content
                                    title={item.name}
                                    description={item.url}
                                />
                                <ListItem.ListItemIcon
                                    icon="share"
                                    position="right"
                                    onPress={() => {
                                        Clipboard.setString(item.url);
                                        Toast.success('已复制到剪切板');
                                    }}
                                />
                            </ListItem>
                        );
                    }}
                    getItemLayout={(_, index) => ({
                        length: ITEM_HEIGHT,
                        offset: ITEM_HEIGHT * index,
                        index,
                    })}
                />
            </HorizontalSafeAreaView>
            <Fab
                icon="plus"
                onPress={() => {
                    showDialog('SubscribePluginDialog', {
                        onSubmit,
                    });
                }}
            />
        </>
    );
}

const style = StyleSheet.create({
    wrapper: {
        width: rpx(750),
        flex: 1,
    },
    listWrapper: {
        marginTop: rpx(24),
    },
    fab: {
        position: 'absolute',
        right: rpx(36),
        bottom: rpx(36),
    },
});
