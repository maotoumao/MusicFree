import React from 'react';
import {FlatList} from 'react-native-gesture-handler';
import {hideDialog} from '../useDialog';
import Dialog from './base';
import ListItem from '@/components/base/listItem';
import useOrientation from '@/hooks/useOrientation';
import {vmax, vmin} from '@/utils/rpx';
import {IIconName} from '@/components/base/icon.tsx';
import useColors from '@/hooks/useColors.ts';

interface IKV<T extends string | number = string | number> {
    label: string;
    value: T;
    icon?: IIconName;
}

interface IRadioDialogProps<T extends string | number = string | number> {
    title: string;
    content: Array<T | IKV<T>>;
    defaultSelected?: T;
    onOk?: (value: T) => void;
}

function isObject(v: string | number | IKV): v is IKV {
    return !(typeof v === 'string' || typeof v === 'number');
}

export default function RadioDialog(props: IRadioDialogProps) {
    const {title, content, onOk, defaultSelected} = props;
    const orientation = useOrientation();
    const colors = useColors();

    return (
        <Dialog onDismiss={hideDialog}>
            <Dialog.Title>{title}</Dialog.Title>
            <FlatList
                style={{
                    maxHeight:
                        orientation === 'horizontal' ? vmin(60) : vmax(60),
                }}
                data={content}
                renderItem={({item}) => {
                    const isConfig = isObject(item);

                    return (
                        <ListItem
                            withHorizontalPadding
                            onPress={() => {
                                if (isConfig) {
                                    onOk?.(item.value);
                                } else {
                                    onOk?.(item);
                                }
                                hideDialog();
                            }}
                            heightType="small">
                            {isConfig && item.icon ? (
                                <ListItem.ListItemIcon icon={item.icon} />
                            ) : null}
                            <ListItem.Content
                                title={isConfig ? item.label : item}
                            />
                            {defaultSelected !== undefined &&
                            defaultSelected ===
                                (isConfig ? item.value : item) ? (
                                <ListItem.ListItemIcon
                                    icon={'check'}
                                    color={colors.primary}
                                />
                            ) : null}
                        </ListItem>
                    );
                }}
            />
        </Dialog>
    );
}
