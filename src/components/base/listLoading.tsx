import React from 'react';
import {ActivityIndicator, StyleSheet, View} from 'react-native';
import rpx from '@/utils/rpx';
import {fontSizeConst} from '@/constants/uiConst';
import ThemeText from './themeText';
import useColors from '@/hooks/useColors';

export default function ListLoading() {
    const colors = useColors();

    return (
        <View style={style.wrapper}>
            <ActivityIndicator
                animating
                color={colors.text}
                size={fontSizeConst.appbar}
            />
            <ThemeText style={style.loadingText}>加载中...</ThemeText>
        </View>
    );
}

const style = StyleSheet.create({
    wrapper: {
        width: '100%',
        height: rpx(140),
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingText: {
        marginTop: fontSizeConst.content * 1.2,
    },
});
