import React from 'react';
import {Portal} from 'react-native-paper';
import components from './components';
import useDialog from './useDialog';

export default function () {
    const {dialogName, hideDialog, payload} = useDialog();

    return (
        <Portal>
            {components.map(([key, DialogComponent]) =>
                dialogName === key ? (
                    <DialogComponent
                        key={key}
                        visible={dialogName === key}
                        hideDialog={hideDialog}
                        {...(payload ?? {})}
                    />
                ) : (
                    <></>
                ),
            )}
        </Portal>
    );
}
