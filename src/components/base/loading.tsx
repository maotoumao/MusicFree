import React from 'react';
import {StyleSheet, View} from 'react-native';
import rpx from '@/utils/rpx';
import {ActivityIndicator, useTheme} from 'react-native-paper';
import ThemeText from './themeText';

export default function Loading() {
    const {colors} = useTheme();

    return (
        <View style={style.wrapper}>
            <ActivityIndicator animating color={colors.text} />
            <ThemeText
                fontSize="title"
                fontWeight="semibold"
                style={style.text}>
                加载中...
            </ThemeText>
        </View>
    );
}

const style = StyleSheet.create({
    wrapper: {
        width: '100%',
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    text: {
        marginTop: rpx(48),
    },
});
