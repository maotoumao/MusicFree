import React from 'react';
import rpx from '@/utils/rpx';
import {Dialog} from 'react-native-paper';
import useColors from '@/hooks/useColors';
import {FlatList} from 'react-native-gesture-handler';
import ListItem from '@/components/base/listItem';
import useDialog from '../useDialog';

interface IKV<T extends string | number = string | number> {
    key: T;
    value: T;
}

interface IRadioDialogProps<T extends string | number = string | number> {
    title: string;
    content: Array<T | IKV<T>>;
    onOk?: (value: T) => void;
}

function isObject(v: string | number | IKV): v is IKV {
    return typeof v === 'string' || typeof v === 'number' ? false : true;
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
                                if (isObject(item)) {
                                    onOk?.(item.value);
                                } else {
                                    onOk?.(item);
                                }
                                hideDialog();
                            }}
                            itemHeight={rpx(96)}
                            title={isObject(item) ? item.key : item}
                        />
                    )}
                />
            </Dialog.Content>
        </Dialog>
    );
}
