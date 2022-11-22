import React, {useEffect, useRef} from 'react';
import {BackHandler, NativeEventSubscription} from 'react-native';
import {Portal} from 'react-native-paper';
import panels from './types';
import usePanel, {panelInfoStore} from './usePanel';

function Panels() {
    const {unmountPanel} = usePanel();
    const panelInfoState = panelInfoStore.useValue();

    const Component = panelInfoState.name ? panels[panelInfoState.name] : null;

    const backHandlerRef = useRef<NativeEventSubscription>();

    useEffect(() => {
        if (backHandlerRef.current) {
            backHandlerRef.current?.remove();
            backHandlerRef.current = undefined;
        }
        if (panelInfoState.name) {
            backHandlerRef.current = BackHandler.addEventListener(
                'hardwareBackPress',
                () => {
                    unmountPanel();
                    return true;
                },
            );
        }
        return () => {
            if (backHandlerRef.current) {
                backHandlerRef.current?.remove();
                backHandlerRef.current = undefined;
            }
        };
    }, [panelInfoState]);

    return (
        <Portal>
            {Component ? (
                <Component {...(panelInfoState.payload ?? {})} />
            ) : null}
        </Portal>
    );
}

export default React.memo(Panels, () => true);
