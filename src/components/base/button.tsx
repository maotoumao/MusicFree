import React from 'react';
import {Button} from 'react-native-paper';
import ThemeText from './themeText';

interface IButtonProps {
    children: string;
    onPress?: () => void;
}
export default function (props: IButtonProps) {
    const {children, onPress} = props;
    return (
        <Button {...props} onPress={onPress}>
            <ThemeText>{children}</ThemeText>
        </Button>
    );
}
