import React from 'react';
import {StyleSheet, View} from 'react-native';
import rpx from '@/utils/rpx';
import ComplexAppBar from '@/components/base/ComplexAppBar';

// todo 批量编辑
export default function MusicListEditor() {
    return (
        <View style={style.wrapper}>
            <ComplexAppBar />
        </View>
    );
}

const style = StyleSheet.create({
    wrapper: {
        width: rpx(750),
    },
});
