import React, {useState} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import rpx from '@/utils/rpx';
import Slider from '@react-native-community/slider';
import MusicQueue from '@/core/musicQueue';
import timeformat from '@/utils/timeformat';
import {fontSizeConst} from '@/constants/uiConst';

export default function SeekBar() {
    const progress = MusicQueue.useProgress(400);
    const [tmpProgress, setTmpProgress] = useState<number | null>(null);

    return (
        <View style={style.wrapper}>
            <Text style={style.text}>
                {timeformat(tmpProgress ?? progress.position)}
            </Text>
            <Slider
                style={style.slider}
                minimumTrackTintColor={'#cccccc'}
                maximumTrackTintColor={'#999999'}
                thumbTintColor={'#dddddd'}
                minimumValue={0}
                maximumValue={progress.duration}
                onValueChange={val => {
                    setTmpProgress(val);
                }}
                onSlidingComplete={val => {
                    setTmpProgress(null);
                    MusicQueue.seekTo(val);
                }}
                value={progress.position}
            />
            <Text style={style.text}>{timeformat(progress.duration)}</Text>
        </View>
    );
}

const style = StyleSheet.create({
    wrapper: {
        width: rpx(750),
        height: rpx(40),
        justifyContent: 'center',
        alignItems: 'center',
        flexDirection: 'row',
    },
    slider: {
        width: rpx(550),
        height: rpx(40),
    },
    text: {
        fontSize: fontSizeConst.description,
        includeFontPadding: false,
        color: '#cccccc',
    },
});
