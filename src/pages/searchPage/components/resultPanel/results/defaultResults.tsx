import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import rpx from '@/utils/rpx';

export default function DefaultResults() {
    return (
        <View style={style.wrapper}>
            <Text>敬请期待</Text>
        </View>
    );
}

const style = StyleSheet.create({
    wrapper: {
        width: rpx(750),
    },
});
