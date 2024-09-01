import React from 'react';
import {StyleProp, ViewStyle} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

interface IHorizontalSafeAreaViewProps {
    mode?: 'margin' | 'padding';
    children: JSX.Element | JSX.Element[];
    style?: StyleProp<ViewStyle>;
}
export default function HorizontalSafeAreaView(
    props: IHorizontalSafeAreaViewProps,
) {
    const {children, style, mode} = props;
    return (
        <SafeAreaView style={style} mode={mode} edges={['right', 'left']}>
            {children}
        </SafeAreaView>
    );
}
