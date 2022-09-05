import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import rpx from '@/utils/rpx';
import {Button, Dialog, List, Paragraph} from 'react-native-paper';
import useDialog from '../useDialog';
import useColors from '@/hooks/useColors';
import Color from 'color';
import {FlatList} from 'react-native-gesture-handler';
import ListItem from '@/components/base/listItem';

interface IRadioDialogProps {
  visible: boolean;
  hideDialog: () => void;
  title: string;
  content: Array<string | number>;
  onOk?: (value: string | number) => void;
}

export default function RadioDialog(props: IRadioDialogProps) {
  const {visible, hideDialog, title, content, onOk} = props;
  const colors = useColors();
  return (
    <Dialog
      visible={visible}
      onDismiss={hideDialog}
      style={{backgroundColor: colors.primary}}>
      <Dialog.Title>{title}</Dialog.Title>
      <Dialog.Content>
        <FlatList
          data={content}
          renderItem={({item}) => <ListItem onPress={() => {
            onOk?.(item);
            hideDialog();
          }} itemHeight={rpx(96)} title={item}></ListItem>}></FlatList>
      </Dialog.Content>
    </Dialog>
  );
}

const style = StyleSheet.create({
  wrapper: {
    width: rpx(750),
  },
});
