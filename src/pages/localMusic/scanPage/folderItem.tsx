import React, {memo} from 'react';
import {Pressable, StyleSheet, View} from 'react-native';
import rpx from '@/utils/rpx';
import ThemeText from '@/components/base/themeText';
import {Checkbox} from 'react-native-paper';

const ITEM_HEIGHT = rpx(72);

interface IProps {
    folderPath: string;
    parentPath: string;
    checked?: boolean;
    onItemPress: () => void;
    onCheckedChange: (checked: boolean) => void;
}
function FolderItem(props: IProps) {
    const {
        folderPath,
        parentPath,
        checked,
        onItemPress,
        onCheckedChange: onCheckChange,
    } = props;
    return (
        <View style={style.wrapper}>
            <Pressable onPress={onItemPress}>
                <ThemeText
                    style={style.path}
                    numberOfLines={1}
                    ellipsizeMode="tail"
                    fontSize="subTitle">
                    {folderPath.substring(parentPath.length + 1)}
                </ThemeText>
            </Pressable>
            <Checkbox
                status={checked ? 'checked' : 'unchecked'}
                onPress={() => {
                    onCheckChange(!checked);
                }}
            />
        </View>
    );
}

export default memo(
    FolderItem,
    (prev, curr) =>
        prev.checked === curr.checked &&
        prev.parentPath === curr.parentPath &&
        prev.folderPath === curr.folderPath,
);

const style = StyleSheet.create({
    wrapper: {
        width: rpx(750),
        height: ITEM_HEIGHT,
        paddingHorizontal: rpx(24),
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    path: {
        height: '100%',
        textAlignVertical: 'center',
        paddingEnd: rpx(60),
    },
});
