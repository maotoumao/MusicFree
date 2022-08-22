import React, {useEffect, useRef} from 'react';
import {BackHandler, NativeEventSubscription} from 'react-native';
import {Portal} from 'react-native-paper';
import panels from './types';
import {_usePanelShow} from './usePanelShow';

interface IProps {}
export default function (props: IProps) {
  const {sheetName, payload, closePanel} = _usePanelShow();
  const Component = sheetName ? panels[sheetName] : null;

  const backHandlerRef = useRef<NativeEventSubscription>();

  useEffect(() => {
    if (backHandlerRef.current) {
      backHandlerRef.current?.remove();
      backHandlerRef.current = undefined;
    }
    if (sheetName) {
      backHandlerRef.current = BackHandler.addEventListener(
        'hardwareBackPress',
        () => {
          closePanel();
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
  }, [sheetName]);

  return (
    <Portal>
      {Component ? <Component {...(payload ?? {})}></Component> : <></>}
    </Portal>
  );
}
