import React, {useState} from 'react';
import rpx from '@/utils/rpx';
import {StyleSheet, View} from 'react-native';
import ThemeText from '@/components/base/themeText';
import {hideDialog} from '../useDialog';
import Dialog from './base';
import Input from '@/components/base/input';
import useColors from '@/hooks/useColors';
import { useI18N } from '@/core/i18n';

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

    const colors = useColors();
    const {t} = useI18N();

    const textColors = {
        color: colors.text,
        borderBottomColor: colors.textSecondary,
    };

    return (
        <Dialog onDismiss={hideDialog}>
            <Dialog.Title>{t("dialog.subscriptionPluginDialog.title")}</Dialog.Title>
            <Dialog.Content>
                <View style={style.headerWrapper}>
                    <ThemeText>{t("common.name")}: </ThemeText>
                    <Input
                        hasHorizontalPadding={false}
                        style={[style.textInput, textColors]}
                        value={name}
                        onChangeText={t => {
                            setName(t);
                        }}
                    />
                </View>
                <View style={style.headerWrapper}>
                    <ThemeText>URL: </ThemeText>
                    <Input
                        hasHorizontalPadding={false}
                        style={[style.textInput, textColors]}
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
            </Dialog.Content>
            <Dialog.Actions
                actions={[
                    {
                        type: 'normal',
                        title: t("common.delete"),
                        show: editingIndex !== undefined,
                        onPress() {
                            onDelete?.(editingIndex!, hideDialog);
                        },
                    },
                    {
                        type: 'primary',
                        title: t("common.save"),
                        onPress() {
                            onSubmit(
                                {
                                    name,
                                    url,
                                },
                                hideDialog,
                                editingIndex,
                            );
                        },
                    },
                ]}
            />
        </Dialog>
    );
}

const style = StyleSheet.create({
    headerWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        height: rpx(92),
    },
    textInput: {
        flex: 1,
        includeFontPadding: false,
        marginLeft: rpx(12),
        borderBottomWidth: 1,
    },
});
