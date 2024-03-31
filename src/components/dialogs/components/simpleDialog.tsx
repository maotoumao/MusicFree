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

    const actions = onOk
        ? [
              {
                  title: '取消',
                  type: 'normal',
                  onPress: hideDialog,
              },
              {
                  title: '确认',
                  type: 'primary',
                  onPress() {
                      onOk?.();
                      hideDialog();
                  },
              },
          ]
        : ([
              {
                  title: '我知道了',
                  type: 'primary',
                  onPress() {
                      hideDialog();
                  },
              },
          ] as any);

    return (
        <Dialog onDismiss={hideDialog}>
            <Dialog.Title withDivider>{title}</Dialog.Title>
            <Dialog.Content needScroll>{content}</Dialog.Content>
            <Dialog.Actions actions={actions} />
        </Dialog>
    );
}
