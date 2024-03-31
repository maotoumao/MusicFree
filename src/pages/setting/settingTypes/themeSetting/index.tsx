import React from 'react';
import {StyleSheet} from 'react-native';
import rpx from '@/utils/rpx';
import Mode from './mode';
import Background from './background';
import {ScrollView} from 'react-native-gesture-handler';
// import AppLogoSetting from './appLogoSetting';

export default function ThemeSetting() {
    return (
        <ScrollView style={style.wrapper}>
            <Mode />
            <Background />
            {/* <AppLogoSetting /> */}
        </ScrollView>
    );
}

const style = StyleSheet.create({
    wrapper: {
        width: '100%',
        marginVertical: rpx(24),
    },
});
