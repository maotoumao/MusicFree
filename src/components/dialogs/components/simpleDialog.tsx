import React from 'react';
import {Button, Dialog, Paragraph} from 'react-native-paper';
import useColors from '@/hooks/useColors';

interface ISimpleDialogProps {
    visible: boolean;
    hideDialog: () => void;
    title: string;
    content: string;
    onOk?: () => void;
}
export default function SimpleDialog(props: ISimpleDialogProps) {
    const {visible, hideDialog, title, content, onOk} = props;
    const colors = useColors();
    return (
        <Dialog
            visible={visible}
            onDismiss={hideDialog}
            style={{backgroundColor: colors.primary}}>
            <Dialog.Title>{title}</Dialog.Title>
            <Dialog.Content>
                <Paragraph>{content}</Paragraph>
            </Dialog.Content>
            <Dialog.Actions>
                <Button color={colors.text} onPress={hideDialog}>
                    取消
                </Button>
                <Button
                    color={colors.text}
                    onPress={() => {
                        onOk?.();
                        hideDialog();
                    }}>
                    确认
                </Button>
            </Dialog.Actions>
        </Dialog>
    );
}
