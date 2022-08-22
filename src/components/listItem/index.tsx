import {fontSizeConst} from '@/constants/uiConst';
import rpx from '@/utils/rpx';
import React from 'react';
import {GestureResponderEvent, Pressable, StyleSheet, Text} from 'react-native';
import { useTheme } from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

interface IListItemProps {
  icon: string;
  title: string;
  onPress?: (evt: GestureResponderEvent) => void;
  theme?: {
    color?: string;
    fontSize?: number;
  };
}
export default function ListItem(props: IListItemProps) {
  const {icon, title, onPress, theme} = props;
  const {colors} = useTheme();

  return (
    <Pressable style={listItemStyle.wrapper} onPress={onPress}>
      <Icon
        name={icon}
        size={theme?.fontSize ?? fontSizeConst.normal}
        color={theme?.color ?? colors.text}></Icon>
      <Text style={[listItemStyle.title, {color: theme?.color ?? colors.text, fontSize: theme?.fontSize}]}>{title}</Text>
    </Pressable>
  );
}

const listItemStyle = StyleSheet.create({
  wrapper: {
    height: rpx(100),
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
  },
  title: {
    marginLeft: rpx(28),
    fontSize: fontSizeConst.normal,
  },
});
