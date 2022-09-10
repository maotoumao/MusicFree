import React from 'react';
import {Image, ImageProps, StyleSheet, Text, View} from 'react-native';
import rpx from '@/utils/rpx';

interface IImageProps extends ImageProps {
  uri?: string;
  emptySrc: any;
}
export default function (props: Omit<IImageProps, 'source'>) {
  const {uri, emptySrc} = props;
  const source = uri
    ? {
        uri,
      }
    : emptySrc;
  return <Image {...props} source={source}></Image>;
}
