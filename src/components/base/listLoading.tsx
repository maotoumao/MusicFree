import React from 'react';
import {StyleSheet, View} from 'react-native';
import rpx from '@/utils/rpx';
import {ActivityIndicator, useTheme} from 'react-native-paper';
import {fontSizeConst} from '@/constants/uiConst';
import ThemeText from './themeText';

export default function ListLoading() {
    const {colors} = useTheme();

    return (
        <View style={style.wrapper}>
            <ActivityIndicator
                animating
                color={colors.text}
                size={fontSizeConst.title}
            />
            <ThemeText style={style.loadingText}>加载中...</ThemeText>
        </View>
    );
}

const style = StyleSheet.create({
    wrapper: {
        width: '100%',
        height: rpx(420),
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingText: {
        marginTop: rpx(100),
    },
});
