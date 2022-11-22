import React, {useState} from 'react';
import rpx from '@/utils/rpx';
import {Dialog, TextInput} from 'react-native-paper';
import useColors from '@/hooks/useColors';
import {StyleSheet, View} from 'react-native';
import ThemeText from '@/components/base/themeText';
import Button from '@/components/base/button';
import Config from '@/core/config';
import Toast from '@/utils/toast';
import useDialog from '../useDialog';

interface ISubscribePluginDialogProps {
    visible: boolean;
    hideDialog: () => void;
    onUpdatePlugins: (hideDialog: () => void) => void;
}

export default function SubscribePluginDialog(
    props: ISubscribePluginDialogProps,
) {
    const {onUpdatePlugins} = props;
    const {hideDialog} = useDialog();
    const colors = useColors();
    const [text, setText] = useState(Config.get('setting.plugin.subscribeUrl'));
    const subscribeUrl = Config.useConfig('setting.plugin.subscribeUrl');
    return (
        <Dialog
            visible={true}
            onDismiss={hideDialog}
            style={{backgroundColor: colors.primary}}>
            <Dialog.Title>插件订阅</Dialog.Title>
            <Dialog.Content>
                <View style={style.headerWrapper}>
                    <ThemeText>URL: </ThemeText>
                    <TextInput
                        style={style.textInput}
                        value={text ?? ''}
                        onChangeText={t => {
                            setText(t);
                        }}
                    />
                    <Button
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
                    </Button>
                </View>
                <View style={style.options}>
                    <Button
                        fontColor="highlight"
                        onPress={() => {
                            onUpdatePlugins(hideDialog);
                        }}>
                        更新插件
                    </Button>
                    <Button onPress={hideDialog}>关闭</Button>
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
        flexDirection: 'row',
    },
});
