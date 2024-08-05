import React from 'react';
import {StyleProp, StyleSheet, View, ViewProps} from 'react-native';
import rpx from '@/utils/rpx';
import useColors from '@/hooks/useColors';
import {TouchableOpacity} from 'react-native-gesture-handler';
import Icon from '@/components/base/icon.tsx';

interface ICheckboxProps {
    checked?: boolean;
    onPress?: () => void;
    style?: StyleProp<ViewProps>;
}

const slop = rpx(24);

export default function Checkbox(props: ICheckboxProps) {
    const {checked, onPress, style} = props;
    const colors = useColors();

    const innerNode = (
        <View
            style={[
                styles.container,
                checked
                    ? {
                          backgroundColor: colors.primary,
                          borderColor: colors.primary,
                      }
                    : {
                          borderColor: colors.text,
                      },
                style,
            ]}>
            {checked ? (
                <Icon name="check" color={colors.appBarText} size={rpx(34)} />
            ) : null}
        </View>
    );

    return onPress ? (
        <TouchableOpacity
            hitSlop={{
                left: slop,
                right: slop,
                top: slop,
                bottom: slop,
            }}
            onPress={onPress}>
            {innerNode}
        </TouchableOpacity>
    ) : (
        innerNode
    );
}

const styles = StyleSheet.create({
    container: {
        width: rpx(36),
        height: rpx(36),
        borderRadius: rpx(2),
        borderWidth: rpx(1),
        alignItems: 'center',
        justifyContent: 'center',
    },
});
