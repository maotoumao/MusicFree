import React from 'react';
import {FlatList} from 'react-native-gesture-handler';
import {hideDialog} from '../useDialog';
import Dialog from './base';
import ListItem from '@/components/base/listItem';
import useOrientation from '@/hooks/useOrientation';
import {vmax, vmin} from '@/utils/rpx';

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
    const orientation = useOrientation();
    return (
        <Dialog onDismiss={hideDialog}>
            <Dialog.Title>{title}</Dialog.Title>
            <FlatList
                style={{
                    maxHeight:
                        orientation === 'horizonal' ? vmin(60) : vmax(60),
                }}
                data={content}
                renderItem={({item}) => (
                    <ListItem
                        withHorizonalPadding
                        onPress={() => {
                            if (isObject(item)) {
                                onOk?.(item.value);
                            } else {
                                onOk?.(item);
                            }
                            hideDialog();
                        }}
                        heightType="small">
                        <ListItem.Content
                            title={isObject(item) ? item.key : item}
                        />
                    </ListItem>
                )}
            />
        </Dialog>
    );
}
