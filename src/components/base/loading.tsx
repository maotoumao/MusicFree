import React from 'react';
import {ActivityIndicator, StyleSheet, View} from 'react-native';
import rpx from '@/utils/rpx';
import ThemeText from './themeText';
import useColors from '@/hooks/useColors';

interface ILoadingProps {
    text?: string;
    showText?: boolean;
    height?: number;
    color?: string;
}
export default function Loading(props: ILoadingProps) {
    const colors = useColors();
    const {showText = true, height, text, color} = props;

    return (
        <View style={[style.wrapper, {height}]}>
            <ActivityIndicator animating color={color ?? colors.text} />
            {showText ? (
                <ThemeText
                    color={color}
                    fontSize="title"
                    fontWeight="semibold"
                    style={style.text}>
                    {text ?? '加载中...'}
                </ThemeText>
            ) : null}
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
