import React, {memo} from 'react';
import {Pressable, StyleSheet, View} from 'react-native';
import rpx from '@/utils/rpx';
import ThemeText from '@/components/base/themeText';
import {Checkbox} from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import useTextColor from '@/hooks/useTextColor';

const ITEM_HEIGHT = rpx(96);

interface IProps {
    type: 'folder' | 'file';
    path: string;
    parentPath: string;
    checked?: boolean;
    onItemPress: (currentChecked?: boolean) => void;
    onCheckedChange: (checked: boolean) => void;
}
function FileItem(props: IProps) {
    const {
        type,
        path,
        parentPath,
        checked,
        onItemPress,
        onCheckedChange: onCheckChange,
    } = props;

    const textColor = useTextColor();

    // 返回逻辑

    return (
        <View style={style.wrapper}>
            <Pressable
                onPress={() => {
                    onItemPress(checked);
                }}
                style={style.pathWrapper}>
                <Icon
                    name={type === 'folder' ? 'folder-outline' : 'file-outline'}
                    color={textColor}
                    style={style.folderIcon}
                />
                <ThemeText
                    style={style.path}
                    numberOfLines={1}
                    ellipsizeMode="tail">
                    {path.substring(
                        parentPath === '/' ? 1 : parentPath.length + 1,
                    )}
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
    FileItem,
    (prev, curr) =>
        prev.checked === curr.checked &&
        prev.parentPath === curr.parentPath &&
        prev.path === curr.path,
);

const style = StyleSheet.create({
    wrapper: {
        width: '100%',
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
