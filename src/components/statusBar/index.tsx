import React, {} from 'react';
import {StatusBar, StatusBarProps, View} from 'react-native';
import useColors from '@/hooks/useColors';
import rpx from '@/utils/rpx';

interface IStatusBarProps extends StatusBarProps {}

export default function (props: IStatusBarProps) {
  const colors = useColors();
  const {backgroundColor} = props;

  return (
    <View
      style={{
        position: 'absolute',
        top: 0,
        backgroundColor: backgroundColor ?? colors.primary,
        width: rpx(750),
        height: StatusBar.currentHeight,
      }}></View>
  );
}
