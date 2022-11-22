import React, {useEffect} from 'react';
import {Button, Dialog} from 'react-native-paper';
import useColors from '@/hooks/useColors';
import Loading from '@/components/base/loading';
import rpx from '@/utils/rpx';
import {StyleSheet} from 'react-native';
import useDialog from '../useDialog';

interface ISimpleDialogProps<T extends any = any> {
    promise: Promise<T>;
    title: string;
    onResolve?: (data: T, hideDialog: () => void) => void;
    onReject?: (reason: any, hideDialog: () => void) => void;
    onCancel?: (hideDialog: () => void) => void;
}
export default function LoadingDialog(props: ISimpleDialogProps) {
    const {title, onResolve, onReject, promise, onCancel} = props;
    const colors = useColors();
    const {hideDialog} = useDialog();

    useEffect(() => {
        promise
            ?.then(data => {
                onResolve?.(data, hideDialog);
            })
            .catch(e => {
                onReject?.(e, hideDialog);
            });
    }, []);

    return (
        <Dialog
            visible={true}
            onDismiss={hideDialog}
            style={{backgroundColor: colors.primary}}>
            <Dialog.Title>{title}</Dialog.Title>
            <Dialog.Content style={style.content}>
                <Loading text="扫描中..." />
            </Dialog.Content>
            <Dialog.Actions>
                <Button
                    color={colors.text}
                    onPress={() => {
                        onCancel?.(hideDialog);
                    }}>
                    取消
                </Button>
            </Dialog.Actions>
        </Dialog>
    );
}

const style = StyleSheet.create({
    content: {
        height: rpx(280),
    },
});
