import React from 'react';
import {StyleSheet, View} from 'react-native';
import rpx from '@/utils/rpx';
import Mode from './mode';
import Background from './background';

export default function ThemeSetting() {
    return (
        <View style={style.wrapper}>
            <Mode />
            <Background />
        </View>
    );
}

const style = StyleSheet.create({
    wrapper: {
        width: rpx(750),
        padding: rpx(24),
    },
    header: {
        marginTop: rpx(36),
    },
    sectionWrapper: {
        marginTop: rpx(24),
    },
});
