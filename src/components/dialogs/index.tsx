import React from 'react';
import {Portal} from 'react-native-paper';
import components from './components';
import useDialog from './useDialog';

interface IProps {}
export default function (props: IProps) {
  const {dialogName, hideDialog, payload} = useDialog();
  console.log(dialogName);
  return (
    <Portal>
      {components.map(([key, DialogComponent]) => (
        <DialogComponent
          visible={dialogName === key}
          hideDialog={hideDialog}
          {...(payload ?? {})}></DialogComponent>
      ))}
    </Portal>
  );
}
