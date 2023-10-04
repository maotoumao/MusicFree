import React, {useEffect} from 'react';
import {StatusBar, StatusBarProps, View} from 'react-native';
import useColors from '@/hooks/useColors';

interface IStatusBarProps extends StatusBarProps {}

export default function (props: IStatusBarProps) {
    const colors = useColors();
    const {backgroundColor, barStyle} = props;

    useEffect(() => {
        if (barStyle) {
            StatusBar.setBarStyle(barStyle);
        }
    }, [barStyle]);

    return (
        <View
            style={{
                zIndex: 10000,
                position: 'absolute',
                top: 0,
                backgroundColor: backgroundColor ?? colors.primary,
                width: '100%',
                height: StatusBar.currentHeight,
            }}
        />
    );
}
