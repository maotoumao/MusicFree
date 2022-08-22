import React, { useState } from 'react';
import {StyleSheet, Text, View} from 'react-native';
import rpx from '@/utils/rpx';
import Slider from '@react-native-community/slider';
import MusicQueue from '@/common/musicQueue';
import timeformat from '@/utils/timeformat';
import { fontSizeConst } from '@/constants/uiConst';
import ThemeText from '@/components/themeText';
import useTextColor from '@/hooks/useTextColor';
import Color from 'color';

interface ISeekBarProps {}
export default function SeekBar(props: ISeekBarProps) {
  const progress = MusicQueue.useProgress(800);
  const [tmpProgress, setTmpProgress] = useState<number | null>(null);
  const textColor = useTextColor();

  return (
    <View style={style.wrapper}>
      <ThemeText type='secondary' style={style.text}>{timeformat(tmpProgress ?? progress.position)}</ThemeText>
      <Slider
        style={style.slider}
        minimumTrackTintColor={textColor}
        maximumTrackTintColor={Color(textColor).alpha(0.7).toString()}
        thumbTintColor={textColor}
        minimumValue={0}
        maximumValue={progress.duration}
        onValueChange={(val)=>{
            setTmpProgress(val);
        }}
        onSlidingComplete={(val) => {
            setTmpProgress(null);
            MusicQueue.seekTo(val);
        }}
        value={progress.position}></Slider>
      <ThemeText type='secondary' style={style.text}>{timeformat(progress.duration)}</ThemeText>
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
    fontSize: fontSizeConst.smaller,
    includeFontPadding: false,
  }
});
