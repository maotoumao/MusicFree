import React from 'react';
import {StyleSheet, View} from 'react-native';
import rpx from '@/utils/rpx';
import ThemeText from '@/components/base/themeText';

export default function BackupSetting() {
    return (
        <View style={style.wrapper}>
            <ThemeText>还没做完...再等等吧~</ThemeText>
        </View>
    );
}

const style = StyleSheet.create({
    wrapper: {
        width: rpx(750),
    },
});
