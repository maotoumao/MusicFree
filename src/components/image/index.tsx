import React from 'react';
import {Image, ImageProps, StyleSheet, Text, View} from 'react-native';
import rpx from '@/utils/rpx';

interface IImageProps extends ImageProps {
  uri?: string;
  fallback: any;
}
export default function (props: Omit<IImageProps, 'source'>) {
  const {uri, fallback} = props;
  const source = uri
    ? {
        uri,
      }
    : fallback;
  return <Image {...props} source={source}></Image>;
}
