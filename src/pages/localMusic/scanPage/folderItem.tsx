import React, {memo} from 'react';
import {Pressable, StyleSheet, View} from 'react-native';
import rpx from '@/utils/rpx';
import ThemeText from '@/components/base/themeText';
import {Checkbox} from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import useTextColor from '@/hooks/useTextColor';

const ITEM_HEIGHT = rpx(96);

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

    const textColor = useTextColor();

    // 返回逻辑

    return (
        <View style={style.wrapper}>
            <Pressable onPress={onItemPress} style={style.pathWrapper}>
                <Icon
                    name="folder-outline"
                    color={textColor}
                    style={style.folderIcon}
                />
                <ThemeText
                    style={style.path}
                    numberOfLines={1}
                    ellipsizeMode="tail">
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
    folderIcon: {
        fontSize: rpx(32),
        marginRight: rpx(14),
    },
    pathWrapper: {
        flexDirection: 'row',
        flex: 1,
        alignItems: 'center',
        height: '100%',
        marginRight: rpx(60),
    },
    path: {
        height: '100%',
        textAlignVertical: 'center',
    },
});
