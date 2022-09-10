import React from 'react';
import {StyleSheet, View} from 'react-native';
import rpx from '@/utils/rpx';
import ThemeText from './themeText';

export default function ListReachEnd() {
    return (
        <View style={style.wrapper}>
            <ThemeText fontSize="content" fontColor="secondary">
                ~~~ 到底啦 ~~~
            </ThemeText>
        </View>
    );
}

const style = StyleSheet.create({
    wrapper: {
        width: '100%',
        flex: 1,
        minHeight: rpx(100),
        justifyContent: 'center',
        alignItems: 'center',
    },
});
