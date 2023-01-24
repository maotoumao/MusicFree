import React, {useState} from 'react';
import rpx from '@/utils/rpx';
import {Dialog, TextInput} from 'react-native-paper';
import useColors from '@/hooks/useColors';
import {StyleSheet, View} from 'react-native';
import ThemeText from '@/components/base/themeText';
import Button from '@/components/base/button';
import useDialog from '../useDialog';
interface ISubscribeItem {
    name: string;
    url: string;
}
interface ISubscribePluginDialogProps {
    subscribeItem?: ISubscribeItem;
    onSubmit: (
        subscribeItem: ISubscribeItem,
        hideDialog: () => void,
        editingIndex?: number,
    ) => void;
    editingIndex?: number;
    onDelete?: (editingIndex: number, hideDialog: () => void) => void;
}

export default function SubscribePluginDialog(
    props: ISubscribePluginDialogProps,
) {
    const {subscribeItem, onSubmit, editingIndex, onDelete} = props;
    const [name, setName] = useState(subscribeItem?.name ?? '');
    const [url, setUrl] = useState(subscribeItem?.url ?? '');
    const {hideDialog} = useDialog();
    const colors = useColors();
    return (
        <Dialog
            visible={true}
            onDismiss={hideDialog}
            style={{backgroundColor: colors.primary}}>
            <Dialog.Title>订阅</Dialog.Title>
            <Dialog.Content>
                <View style={style.headerWrapper}>
                    <ThemeText>名称: </ThemeText>
                    <TextInput
                        style={style.textInput}
                        value={name}
                        onChangeText={t => {
                            setName(t);
                        }}
                    />
                </View>
                <View style={style.headerWrapper}>
                    <ThemeText>URL: </ThemeText>
                    <TextInput
                        style={style.textInput}
                        value={url}
                        onChangeText={t => {
                            setUrl(t);
                        }}
                    />
                    {/* <Button
                        fontColor={
                            subscribeUrl && subscribeUrl === text
                                ? 'secondary'
                                : 'normal'
                        }
                        onPress={() => {
                            if (subscribeUrl !== text) {
                                if (text?.trim?.()?.endsWith?.('.json')) {
                                    Config.set(
                                        'setting.plugin.subscribeUrl',
                                        text?.trim(),
                                    );
                                    Toast.success('更新订阅成功');
                                } else {
                                    Toast.warn('订阅链接有误，请检查订阅链接');
                                }
                            }
                        }}>
                        保存
                    </Button> */}
                </View>
                <View style={style.options}>
                    <Button
                        fontColor="highlight"
                        onPress={() => {
                            onSubmit(
                                {
                                    name,
                                    url,
                                },
                                hideDialog,
                                editingIndex,
                            );
                        }}>
                        保存
                    </Button>
                    {editingIndex !== undefined ? (
                        <Button
                            onPress={() => {
                                onDelete?.(editingIndex, hideDialog);
                            }}>
                            删除
                        </Button>
                    ) : null}
                </View>
            </Dialog.Content>
        </Dialog>
    );
}

const style = StyleSheet.create({
    headerWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    textInput: {
        flex: 1,
        includeFontPadding: false,
        borderBottomColor: 'white',
        borderBottomWidth: 1,
    },
    options: {
        marginTop: rpx(32),
        flexDirection: 'row-reverse',
        justifyContent: 'space-between',
    },
});
