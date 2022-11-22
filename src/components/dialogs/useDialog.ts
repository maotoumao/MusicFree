import {GlobalState} from '@/utils/stateMapper';
import {useCallback} from 'react';
import {IDialogKey, IDialogType} from './components';

interface IDialogInfo {
    name: IDialogKey | null;
    payload: any;
}

export const dialogInfoStore = new GlobalState<IDialogInfo>({
    name: null,
    payload: null,
});

export default function useDialog() {
    const showDialog = useCallback(
        <T extends keyof IDialogType>(
            name: T,
            payload?: Parameters<IDialogType[T]>[0],
        ) => {
            dialogInfoStore.setValue({
                name,
                payload,
            });
        },
        [],
    );

    const hideDialog = useCallback(() => {
        dialogInfoStore.setValue({
            name: null,
            payload: null,
        });
    }, []);

    return {showDialog, hideDialog};
}
