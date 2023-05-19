import {ColorKey} from '@/constants/uiConst';
import React from 'react';
import {Button} from 'react-native-paper';
import ThemeText from './themeText';

interface IButtonProps {
    style?: any;
    children: string;
    fontColor?: ColorKey;
    onPress?: () => void;
}
export default function (props: IButtonProps) {
    const {children, onPress, fontColor} = props;
    return (
        <Button {...props} onPress={onPress}>
            <ThemeText fontColor={fontColor}>{children}</ThemeText>
        </Button>
    );
}
