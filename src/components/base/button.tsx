import {ColorKey} from '@/constants/uiConst';
import React from 'react';
import {Pressable} from 'react-native';
import ThemeText from './themeText';
import rpx from '@/utils/rpx';

interface IButtonProps {
    style?: any;
    hitSlop?: number;
    children: string;
    fontColor?: ColorKey;
    onPress?: () => void;
}
export default function (props: IButtonProps) {
    const {children, onPress, fontColor, hitSlop} = props;
    return (
        <Pressable
            {...props}
            hitSlop={hitSlop ?? rpx(28)}
            onPress={onPress}
            accessible
            accessibilityLabel={children}>
            <ThemeText fontColor={fontColor}>{children}</ThemeText>
        </Pressable>
    );
}
