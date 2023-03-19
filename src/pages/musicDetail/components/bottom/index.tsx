import React from 'react';
import {StyleSheet, View} from 'react-native';
import rpx from '@/utils/rpx';
import SeekBar from './seekBar';
import PlayControl from './playControl';
import Opertions from './operations';
import useOrientation from '@/hooks/useOrientation';

export default function Bottom() {
    const orientation = useOrientation();
    return (
        <View
            style={[
                style.wrapper,
                orientation === 'horizonal'
                    ? {
                          height: rpx(236),
                      }
                    : undefined,
            ]}>
            <Opertions />
            <SeekBar />
            <PlayControl />
        </View>
    );
}

const style = StyleSheet.create({
    wrapper: {
        width: '100%',
        height: rpx(320),
    },
});
