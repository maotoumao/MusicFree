import React from 'react';
import {StyleSheet, Text} from 'react-native';
import rpx from '@/utils/rpx';
import timeformat from '@/utils/timeformat';
import {fontSizeConst} from '@/constants/uiConst';
import TrackPlayer from '@/core/trackPlayer';

export default function DraggingTime(props: {time: number}) {
    const progress = TrackPlayer.useProgress();

    return (
        <Text style={style.draggingTimeText}>
            {timeformat(Math.min(props.time, progress.duration ?? 0))}
        </Text>
    );
}

const style = StyleSheet.create({
    draggingTimeText: {
        color: '#dddddd',
        fontSize: fontSizeConst.description,
        width: rpx(90),
    },
});
