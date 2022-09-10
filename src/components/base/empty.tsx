import React from 'react';
import {StyleSheet, View} from 'react-native';
import rpx from '@/utils/rpx';
import ThemeText from './themeText';

interface IEmptyProps {
    content?: string;
}
export default function Empty(props: IEmptyProps) {
    return (
        <View style={style.wrapper}>
            <ThemeText fontSize="title">
                {props?.content ?? '什么都没有呀~'}
            </ThemeText>
        </View>
    );
}

const style = StyleSheet.create({
    wrapper: {
        width: '100%',
        flex: 1,
        minHeight: rpx(300),
        justifyContent: 'center',
        alignItems: 'center',
    },
});
