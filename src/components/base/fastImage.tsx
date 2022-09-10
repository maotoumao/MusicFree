import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import rpx from '@/utils/rpx';
import FastImage, {FastImageProps} from 'react-native-fast-image';

interface IFastImageProps {
  style: FastImageProps['style'];
  defaultSource?: FastImageProps['defaultSource'];
  emptySrc?: number;
  uri?: string;
}
export default function (props: IFastImageProps) {
  const {style, emptySrc, uri, defaultSource} = props ?? {};
  const source = uri
    ? {
        uri,
      }
    : emptySrc;
  return (
    <FastImage
      style={style}
      source={source}
      defaultSource={defaultSource}></FastImage>
  );
}

const style = StyleSheet.create({
  wrapper: {
    width: rpx(750),
  },
});
