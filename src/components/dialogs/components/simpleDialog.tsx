import React from 'react';
import {hideDialog} from '../useDialog';
import Dialog from './base';

interface ISimpleDialogProps {
    title: string;
    content: string | JSX.Element;
    onOk?: () => void;
}
export default function SimpleDialog(props: ISimpleDialogProps) {
    const {title, content, onOk} = props;
    return (
        <Dialog onDismiss={hideDialog}>
            <Dialog.Title withDivider>{title}</Dialog.Title>
            <Dialog.Content needScroll>{content}</Dialog.Content>
            <Dialog.Actions
                actions={[
                    {
                        title: '取消',
                        onPress: hideDialog,
                    },
                    {
                        title: '确认',
                        onPress() {
                            onOk?.();
                            hideDialog();
                        },
                    },
                ]}
            />
        </Dialog>
    );
}
