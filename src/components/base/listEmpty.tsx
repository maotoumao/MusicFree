import { RequestStateCode } from '@/constants/commonConst';
import { fontSizeConst } from '@/constants/uiConst';
import useColors from '@/hooks/useColors';
import rpx from '@/utils/rpx';
import React from 'react';
import { ActivityIndicator, StyleSheet, TouchableOpacity, View } from 'react-native';
import ThemeText from './themeText';

interface IEmptyProps {
    state: RequestStateCode
    onRetry?: () => void;
}
export default function ListEmpty(props: IEmptyProps) {
    const { state, onRetry } = props;

    const colors = useColors();

    if (state === RequestStateCode.FINISHED || state === RequestStateCode.PARTLY_DONE) {
        return <View style={style.wrapper}>
            <ThemeText fontSize="title">
                什么都没有呀~
            </ThemeText>
        </View>
    } else if (state === RequestStateCode.PENDING_FIRST_PAGE) {
        return <View style={style.wrapper}>
            <ActivityIndicator animating color={colors.text} size={fontSizeConst.appbar}/>
            <ThemeText
                fontSize="title"
                fontWeight="semibold">
                加载中...
            </ThemeText>
        </View>
    } else if (state === RequestStateCode.ERROR) {
        return <View style={style.wrapper}>
            <ThemeText fontSize="title">
                出错啦...
            </ThemeText>
            <TouchableOpacity onPress={onRetry} style={style.retryButton}>
                <ThemeText>点击重试</ThemeText>
            </TouchableOpacity>
        </View>
    }
 
}

const style = StyleSheet.create({
    wrapper: {
        width: '100%',
        flex: 1,
        minHeight: rpx(540),
        justifyContent: 'center',
        alignItems: 'center',
        gap: rpx(36)
    },
    retryButton: {
        paddingVertical: rpx(24),
        paddingHorizontal: rpx(48),
        borderRadius: rpx(36),
        backgroundColor: 'rgba(128, 128, 128, 0.2)',
    }
});
