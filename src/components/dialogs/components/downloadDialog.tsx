import React, {useState} from 'react';
import {Button, Checkbox, Dialog} from 'react-native-paper';
import useColors from '@/hooks/useColors';
import ThemeText from '@/components/base/themeText';
import {StyleSheet, View} from 'react-native';
import rpx, {vh} from '@/utils/rpx';
import openUrl from '@/utils/openUrl';
import Clipboard from '@react-native-clipboard/clipboard';
import {ScrollView} from 'react-native-gesture-handler';
import useDialog from '../useDialog';
import Config from '@/core/config';

interface IDownloadDialogProps {
    version: string;
    content: string[];
    fromUrl: string;
    backUrl?: string;
}
export default function DownloadDialog(props: IDownloadDialogProps) {
    const {content, fromUrl, backUrl, version} = props;
    const colors = useColors();
    const {hideDialog} = useDialog();
    const [skipState, setSkipState] = useState(false);

    return (
        <Dialog
            visible={true}
            onDismiss={() => {
                if (skipState) {
                    Config.set('status.app.skipVersion', version);
                }
                hideDialog();
            }}
            style={{backgroundColor: colors.primary}}>
            <Dialog.Title>发现新版本({version})</Dialog.Title>
            <ScrollView style={style.scrollView}>
                {content?.map?.(_ => (
                    <ThemeText key={_} style={style.item}>
                        {_}
                    </ThemeText>
                ))}
            </ScrollView>
            <Dialog.Actions style={style.dialogActions}>
                <View style={style.checkboxGroup}>
                    <Checkbox
                        status={skipState ? 'checked' : 'unchecked'}
                        onPress={() => {
                            setSkipState(state => !state);
                        }}
                    />
                    <ThemeText>跳过此版本</ThemeText>
                </View>
                <View style={style.buttonGroup}>
                    <Button
                        color={colors.text}
                        onPress={() => {
                            hideDialog();
                            if (skipState) {
                                Config.set('status.app.skipVersion', version);
                            }
                        }}>
                        取消
                    </Button>
                    <Button
                        color={colors.text}
                        onPress={async () => {
                            Config.set('status.app.skipVersion', undefined);
                            openUrl(fromUrl);
                            Clipboard.setString(fromUrl);
                        }}>
                        从浏览器下载
                    </Button>
                    {backUrl && (
                        <Button
                            color={colors.text}
                            onPress={async () => {
                                openUrl(backUrl);
                                Clipboard.setString(backUrl);
                            }}>
                            备用链接
                        </Button>
                    )}
                </View>
            </Dialog.Actions>
        </Dialog>
    );
}

const style = StyleSheet.create({
    item: {
        marginBottom: rpx(20),
        lineHeight: rpx(36),
    },
    content: {
        flex: 1,
        maxHeight: vh(50),
    },
    scrollView: {
        maxHeight: vh(40),
        paddingHorizontal: rpx(26),
    },
    dialogActions: {
        flexDirection: 'column',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
    },
    checkboxGroup: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    buttonGroup: {
        flexDirection: 'row',
        alignItems: 'center',
        width: '100%',
        justifyContent: 'flex-end',
    },
});
