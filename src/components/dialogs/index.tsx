import React from 'react';
import {Portal} from 'react-native-paper';
import components from './components';
import {dialogInfoStore} from './useDialog';

export default function () {
    const dialogInfoState = dialogInfoStore.useValue();

    const Component = dialogInfoState.name
        ? components[dialogInfoState.name]
        : null;

    return (
        <Portal>
            {Component ? (
                <Component {...(dialogInfoState.payload ?? {})} />
            ) : null}
        </Portal>
    );
}
