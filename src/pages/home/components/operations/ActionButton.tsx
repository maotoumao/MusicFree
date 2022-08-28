import ThemeText from '@/components/themeText';
import {fontSizeConst, fontWeightConst} from '@/constants/uiConst';
import rpx from '@/utils/rpx';
import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {TouchableRipple, useTheme} from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

interface IActionButtonProps {
  iconName: string;
  iconColor?: string;
  title: string;
  action: () => void;
}

export default function ActionButton(props: IActionButtonProps) {
  const {iconName, iconColor, title, action} = props;
  const {colors} = useTheme();
  // rippleColor="rgba(0, 0, 0, .32)"
  return (
    <TouchableRipple onPress={action} style={style.wrapper}>
      <>
      <Icon
        name={iconName}
        color={iconColor ?? colors.text}
        size={rpx(48)}></Icon>
      <ThemeText fontSize="subTitle" fontWeight="semibold" style={style.text}>
        {title}
      </ThemeText>
      </>
    </TouchableRipple>
  );
}

const style = StyleSheet.create({
  wrapper: {
    maxWidth: rpx(218),
    height: '100%',
    flexGrow: 1,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    marginTop: rpx(12),
  },
});
