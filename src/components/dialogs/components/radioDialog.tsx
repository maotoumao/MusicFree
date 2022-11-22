import React from 'react';
import rpx from '@/utils/rpx';
import {Dialog} from 'react-native-paper';
import useColors from '@/hooks/useColors';
import {FlatList} from 'react-native-gesture-handler';
import ListItem from '@/components/base/listItem';
import useDialog from '../useDialog';

interface IRadioDialogProps<T extends string | number = string | number> {
    title: string;
    content: T[];
    onOk?: (value: T) => void;
}

export default function RadioDialog(props: IRadioDialogProps) {
    const {title, content, onOk} = props;
    const {hideDialog} = useDialog();
    const colors = useColors();
    return (
        <Dialog
            visible={true}
            onDismiss={hideDialog}
            style={{backgroundColor: colors.primary}}>
            <Dialog.Title>{title}</Dialog.Title>
            <Dialog.Content>
                <FlatList
                    data={content}
                    renderItem={({item}) => (
                        <ListItem
                            onPress={() => {
                                onOk?.(item);
                                hideDialog();
                            }}
                            itemHeight={rpx(96)}
                            title={item}
                        />
                    )}
                />
            </Dialog.Content>
        </Dialog>
    );
}
