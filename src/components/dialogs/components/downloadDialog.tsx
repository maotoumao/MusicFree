import React from 'react';
import {Button, Dialog} from 'react-native-paper';
import useColors from '@/hooks/useColors';
import ThemeText from '@/components/base/themeText';
import {StyleSheet} from 'react-native';
import rpx from '@/utils/rpx';
import openUrl from '@/utils/openUrl';
import Clipboard from '@react-native-clipboard/clipboard';

interface IDownloadDialogProps {
    visible: boolean;
    hideDialog: () => void;
    title: string;
    content: string[];
    fromUrl: string;
}
export default function DownloadDialog(props: IDownloadDialogProps) {
    const {visible, title, content, fromUrl, hideDialog} = props;
    const colors = useColors();

    return (
        <Dialog
            visible={visible}
            onDismiss={hideDialog}
            style={{backgroundColor: colors.primary}}>
            <Dialog.Title>{title}</Dialog.Title>
            <Dialog.Content>
                {content?.map?.(_ => (
                    <ThemeText key={_} style={style.item}>
                        {_}
                    </ThemeText>
                ))}
            </Dialog.Content>
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
            </Dialog.Actions>
        </Dialog>
    );
}

const style = StyleSheet.create({
    item: {
        marginBottom: rpx(12),
    },
    progress: {
        marginTop: rpx(12),
    },
});
