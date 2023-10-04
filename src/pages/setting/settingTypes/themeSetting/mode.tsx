import React from 'react';
import {StyleSheet, View} from 'react-native';
import rpx from '@/utils/rpx';
import ThemeText from '@/components/base/themeText';
// import Config from '@/core/config';
import ListItem from '@/components/base/listItem';
import {fontSizeConst, fontWeightConst} from '@/constants/uiConst';

export default function Mode() {
    // const mode = Config.useConfig('setting.theme.mode') ?? 'dark';
    return (
        <View>
            <ThemeText fontSize="title" style={style.header}>
                显示样式
            </ThemeText>
            <View style={style.sectionWrapper}>
                <ListItem withHorizonalPadding>
                    <ListItem.Content title="跟随系统深色设置" />
                </ListItem>
            </View>
        </View>
    );
}

const style = StyleSheet.create({
    header: {
        paddingLeft: rpx(24),
        marginTop: rpx(36),
        fontSize: fontSizeConst.subTitle,
        fontWeight: fontWeightConst.bold,
    },
    sectionWrapper: {
        marginTop: rpx(24),
    },
});
