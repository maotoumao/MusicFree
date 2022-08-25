import React, {} from 'react';
import {Image, StyleSheet} from 'react-native';
import {useConfig} from '@/common/localConfigManager';

interface IPageBackgroundProps {}
export default function PageBackground(props: IPageBackgroundProps) {
  const background = useConfig('setting.theme.background');

  return (
    <Image
      style={style.blur}
      blurRadius={15}
      source={
        background
          ? {
              uri: background,
            }
          : require('@/assets/imgs/background.jpg')
      }></Image>
  );
}

const style = StyleSheet.create({
  blur: {
    width: '100%',
    height: '100%',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
});
