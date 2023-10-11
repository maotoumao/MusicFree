import React from 'react';
import {Pressable} from 'react-native';
import ThemeText from './themeText';
import rpx from '@/utils/rpx';
import {CustomizedColors} from '@/hooks/useColors';

interface IButtonProps {
    withHorizonalPadding?: boolean;
    style?: any;
    hitSlop?: number;
    children: string;
    fontColor?: keyof CustomizedColors;
    onPress?: () => void;
}
export default function (props: IButtonProps) {
    const {children, onPress, fontColor, hitSlop, withHorizonalPadding} = props;
    return (
        <Pressable
            {...props}
            style={[
                withHorizonalPadding
                    ? {
                          paddingHorizontal: rpx(24),
                      }
                    : null,
                props.style,
            ]}
            hitSlop={hitSlop ?? (withHorizonalPadding ? 0 : rpx(28))}
            onPress={onPress}
            accessible
            accessibilityLabel={children}>
            <ThemeText fontColor={fontColor}>{children}</ThemeText>
        </Pressable>
    );
}
