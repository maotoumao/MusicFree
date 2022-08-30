import React from 'react';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {ColorKey, iconSizeConst, colorMap} from '@/constants/uiConst';
import {useTheme} from 'react-native-paper';
import { IconProps } from 'react-native-vector-icons/Icon';

interface IIconButtonProps {
  name: string;
  style?: IconProps['style'];
  size?: keyof typeof iconSizeConst;
  fontColor?: ColorKey;
  onPress?: () => void;
}
export default function IconButton(props: IIconButtonProps) {
  const {name, size = 'normal', fontColor = 'normal', onPress, style} = props;
  const theme = useTheme();
  const textSize = iconSizeConst[size];
  const color = theme.colors[colorMap[fontColor]];
  return (
    <Icon
      name={name}
      color={color}
      style={[
        {height: '100%', minWidth: textSize, textAlignVertical: 'center'},
        style,
      ]}
      size={textSize}
      onPress={onPress}></Icon>
  );
}
