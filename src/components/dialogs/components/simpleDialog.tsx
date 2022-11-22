import React from 'react';
import {Button, Dialog, Paragraph} from 'react-native-paper';
import useColors from '@/hooks/useColors';
import useDialog from '../useDialog';

interface ISimpleDialogProps {
    title: string;
    content: string | JSX.Element;
    onOk?: () => void;
}
export default function SimpleDialog(props: ISimpleDialogProps) {
    const {title, content, onOk} = props;
    const colors = useColors();
    const {hideDialog} = useDialog();
    return (
        <Dialog
            visible={true}
            onDismiss={hideDialog}
            style={{backgroundColor: colors.primary}}>
            <Dialog.Title>{title}</Dialog.Title>
            <Dialog.Content>
                {typeof content === 'string' ? (
                    <Paragraph>{content}</Paragraph>
                ) : (
                    <>{content}</>
                )}
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
