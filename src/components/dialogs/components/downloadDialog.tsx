import React from 'react';
import {Button, Dialog} from 'react-native-paper';
import useColors from '@/hooks/useColors';
import ThemeText from '@/components/base/themeText';
import {StyleSheet} from 'react-native';
import rpx, {vh} from '@/utils/rpx';
import openUrl from '@/utils/openUrl';
import Clipboard from '@react-native-clipboard/clipboard';
import {ScrollView} from 'react-native-gesture-handler';

interface IDownloadDialogProps {
    visible: boolean;
    hideDialog: () => void;
    title: string;
    content: string[];
    fromUrl: string;
    backUrl?: string;
}
export default function DownloadDialog(props: IDownloadDialogProps) {
    const {visible, title, content, fromUrl, backUrl, hideDialog} = props;
    const colors = useColors();

    return (
        <Dialog
            visible={visible}
            onDismiss={hideDialog}
            style={{backgroundColor: colors.primary}}>
            <Dialog.Title>{title}</Dialog.Title>
            <ScrollView style={style.scrollView}>
                {content?.map?.(_ => (
                    <ThemeText key={_} style={style.item}>
                        {_}
                    </ThemeText>
                ))}
            </ScrollView>
            <Dialog.Actions>
                <Button
                    color={colors.text}
                    onPress={() => {
                        hideDialog();
                    }}>
                    取消
                </Button>
                <Button
                    color={colors.text}
                    onPress={async () => {
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
});
