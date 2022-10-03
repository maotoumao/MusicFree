import React from 'react';
import {StyleSheet, View} from 'react-native';
import rpx from '@/utils/rpx';
import ThemeText from '@/components/base/themeText';

export default function NoPlugin() {
    return (
        <View style={style.wrapper}>
            <ThemeText fontSize="title">还没有安装插件哦</ThemeText>
            <ThemeText
                style={style.mt}
                fontSize="subTitle"
                fontColor="secondary">
                先去侧边栏-插件设置里安装插件吧~
            </ThemeText>
        </View>
    );
}

const style = StyleSheet.create({
    wrapper: {
        width: rpx(750),
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    mt: {
        marginTop: rpx(24),
    },
});
