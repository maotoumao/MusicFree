import React from 'react';
import rpx from '@/utils/rpx';
import {FlatList} from 'react-native-gesture-handler';
import ListItem from '@/components/base/listItem.old';
import {hideDialog} from '../useDialog';
import Dialog from './base';

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
    return (
        <Dialog onDismiss={hideDialog}>
            <Dialog.Title>{title}</Dialog.Title>
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
        </Dialog>
    );
}
