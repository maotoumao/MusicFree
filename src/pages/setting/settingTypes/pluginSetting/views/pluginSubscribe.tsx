import React, {useEffect, useState} from 'react';
import {StyleSheet} from 'react-native';
import rpx from '@/utils/rpx';
import SimpleAppBar from '@/components/base/simpleAppBar';
import Config from '@/core/config';
import {FlatList} from 'react-native-gesture-handler';
import Empty from '@/components/base/empty';
import ListItem from '@/components/base/listItem';
import {FAB} from 'react-native-paper';
import useColors from '@/hooks/useColors';
import useDialog from '@/components/dialogs/useDialog';
import Toast from '@/utils/toast';
import IconButton from '@/components/base/iconButton';
import Clipboard from '@react-native-clipboard/clipboard';
import HorizonalSafeAreaView from '@/components/base/horizonalSafeAreaView';
import globalStyle from '@/constants/globalStyle';

interface ISubscribeItem {
    name: string;
    url: string;
}

const ITEM_HEIGHT = rpx(108);

export default function PluginSubscribe() {
    const urls = Config.useConfig('setting.plugin.subscribeUrl') ?? '';
    const [subscribes, setSubscribes] = useState<Array<ISubscribeItem>>([]);
    const colors = useColors();
    const {showDialog} = useDialog();

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
            <SimpleAppBar title="订阅设置" />
            <HorizonalSafeAreaView style={globalStyle.flex1}>
                <FlatList
                    style={style.listWrapper}
                    ListEmptyComponent={Empty}
                    data={subscribes}
                    renderItem={({item, index}) => {
                        return (
                            <ListItem
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
                                }}
                                itemHeight={ITEM_HEIGHT}
                                title={item.name}
                                desc={item.url}
                                right={() => (
                                    <IconButton
                                        onPress={() => {
                                            Clipboard.setString(item.url);
                                            Toast.success('已复制到剪切板');
                                        }}
                                        name="share"
                                    />
                                )}
                            />
                        );
                    }}
                    getItemLayout={(_, index) => ({
                        length: ITEM_HEIGHT,
                        offset: ITEM_HEIGHT * index,
                        index,
                    })}
                />
            </HorizonalSafeAreaView>
            <FAB
                icon={'plus'}
                onPress={() => {
                    showDialog('SubscribePluginDialog', {
                        onSubmit,
                    });
                }}
                style={[{backgroundColor: colors.primary}, style.fab]}
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
