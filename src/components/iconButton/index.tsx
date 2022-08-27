import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import rpx from '@/utils/rpx';

import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {ColorKey, iconSizeConst, colorMap} from '@/constants/uiConst';
import {useTheme} from 'react-native-paper';

interface IIconButtonProps {
  name: string;
  size?: keyof typeof iconSizeConst;
  fontColor?: ColorKey;
  onPress?: () => void;
}
export default function IconButton(props: IIconButtonProps) {
  const {name, size = 'normal', fontColor = 'normal', onPress} = props;
  const theme = useTheme();
  const textSize = iconSizeConst[size];
  const color = theme.colors[colorMap[fontColor]];
  return (
    <Icon
      name={name}
      color={color}
      style={{height: '100%', minWidth: textSize, textAlignVertical: 'center'}}
      size={textSize}
      onPress={onPress}></Icon>
  );
}
