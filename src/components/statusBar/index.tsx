import React from 'react';
import {StatusBar, StatusBarProps, StyleSheet, Text, View} from 'react-native';
import rpx from '@/utils/rpx';
import {useTheme} from 'react-native-paper';

interface IStatusBarProps extends StatusBarProps {}

export default function (props: IStatusBarProps) {
  const theme = useTheme();
  return <StatusBar backgroundColor={props.backgroundColor ?? theme.colors.primary}></StatusBar>;
}
