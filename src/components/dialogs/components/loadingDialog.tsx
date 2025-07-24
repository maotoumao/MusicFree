import React, { useEffect } from "react";
import Loading from "@/components/base/loading";
import rpx from "@/utils/rpx";
import { StyleSheet } from "react-native";
import { hideDialog } from "../useDialog";
import Dialog from "./base";
import { useI18N } from "@/core/i18n";

interface ILoadingDialogProps<T extends any = any> {
    promise?: Promise<T>;
    task?: () => Promise<T>;
    title: string;
    loadingText?: string;
    onResolve?: (data: T, hideDialog: () => void) => void;
    onReject?: (reason: any, hideDialog: () => void) => void;
    onCancel?: (hideDialog: () => void) => void;
}
export default function LoadingDialog(props: ILoadingDialogProps) {
    const { title, loadingText, onResolve, onReject, promise, task, onCancel } =
        props;
    
    const { t } = useI18N();

    useEffect(() => {
        const _promise = promise || task?.();
        _promise
            ?.then(data => {
                onResolve?.(data, hideDialog);
            })
            .catch(e => {
                onReject?.(e, hideDialog);
            });
    }, []);

    return (
        <Dialog onDismiss={hideDialog}>
            <Dialog.Title>{title}</Dialog.Title>
            <Dialog.Content style={style.content}>
                <Loading text={loadingText || t("common.loading")} />
            </Dialog.Content>
            <Dialog.Actions
                actions={[
                    {
                        title: t("common.cancel"),
                        onPress() {
                            onCancel?.(hideDialog);
                        },
                    },
                ]}
            />
        </Dialog>
    );
}

const style = StyleSheet.create({
    content: {
        height: rpx(280),
    },
    cancelBtn: {
        marginRight: rpx(12),
        marginBottom: rpx(4),
    },
});
