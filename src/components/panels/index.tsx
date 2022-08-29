import React, {useEffect, useRef} from 'react';
import {BackHandler, NativeEventSubscription} from 'react-native';
import {Portal} from 'react-native-paper';
import panels from './types';
import {_usePanel} from './usePanelShow';

interface IProps {}
export default function (props: IProps) {
  const {panelName, payload, unmountPanel} = _usePanel();
  const Component = panelName ? panels[panelName] : null;

  const backHandlerRef = useRef<NativeEventSubscription>();

  useEffect(() => {
    if (backHandlerRef.current) {
      backHandlerRef.current?.remove();
      backHandlerRef.current = undefined;
    }
    if (panelName) {
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
  }, [panelName]);

  return (
    <Portal>
      {Component ? <Component {...(payload ?? {})}></Component> : <></>}
    </Portal>
  );
}
