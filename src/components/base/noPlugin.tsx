import React from 'react';
import {StyleSheet, View} from 'react-native';
import rpx from '@/utils/rpx';
import ThemeText from '@/components/base/themeText';

interface IProps {
    notSupportType?: string;
}

export default function NoPlugin(props: IProps) {
    return (
        <View style={style.wrapper}>
            <ThemeText fontSize="title">
                还没有安装
                {props?.notSupportType
                    ? `支持「${props.notSupportType}」功能的`
                    : ''}
                插件哦
            </ThemeText>
            <ThemeText
                style={style.mt}
                fontSize="subTitle"
                fontColor="textSecondary">
                先去 侧边栏-插件管理 里安装插件吧~
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
