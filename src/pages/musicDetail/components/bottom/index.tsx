import React from 'react';
import {StyleSheet, View} from 'react-native';
import rpx from '@/utils/rpx';
import SeekBar from './seekBar';
import PlayControl from './playControl';
import Opertions from './operations';

export default function Bottom() {
    return (
        <View style={style.wrapper}>
            <Opertions />
            <SeekBar />
            <PlayControl />
        </View>
    );
}

const style = StyleSheet.create({
    wrapper: {
        width: rpx(750),
        height: rpx(320),
    },
});
