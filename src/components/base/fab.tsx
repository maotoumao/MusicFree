import React from 'react';
import {Pressable, StyleSheet} from 'react-native';
import rpx from '@/utils/rpx';
import useColors from '@/hooks/useColors';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {iconSizeConst} from '@/constants/uiConst';

interface IFabProps {
    icon?: string;
    onPress?: () => void;
}
export default function Fab(props: IFabProps) {
    const {icon, onPress} = props;

    const colors = useColors();

    return (
        <Pressable
            onPress={onPress}
            style={[
                styles.container,
                {
                    backgroundColor: colors.backdrop,
                    shadowColor: colors.shadow,
                },
            ]}>
            {icon ? (
                <Icon
                    name={icon}
                    color={colors.text}
                    size={iconSizeConst.normal}
                />
            ) : null}
        </Pressable>
    );
}

const styles = StyleSheet.create({
    container: {
        width: rpx(108),
        height: rpx(108),
        borderRadius: rpx(54),
        position: 'absolute',
        zIndex: 10010,
        right: rpx(36),
        bottom: rpx(72),
        justifyContent: 'center',
        alignItems: 'center',
        shadowOffset: {
            width: 0,
            height: 5,
        },
        shadowOpacity: 0.34,
        shadowRadius: 6.27,

        elevation: 10,
    },
});
