import React from 'react';
import {Portal} from 'react-native-paper';
import SimpleDialog from './components/simpleDialog';

interface IProps {}
export default function (props: IProps) {
  return (
    <Portal>
      <SimpleDialog></SimpleDialog>
    </Portal>
  );
}
