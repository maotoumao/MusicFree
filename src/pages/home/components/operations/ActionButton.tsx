import ThemeText from '@/components/themeText';
import { fontSizeConst, fontWeightConst } from '@/constants/uiConst';
import rpx from '@/utils/rpx';
import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {TouchableRipple, useTheme} from 'react-native-paper';
import Icon from 'react-native-vector-icons/Ionicons';


interface IActionButtonProps {
  iconName: string;
  iconColor?: string;
  title: string;
  action: () => void;
}

export default function ActionButton(props: IActionButtonProps) {
  const {iconName, iconColor, title, action} = props;
  const {colors} = useTheme();
  
  return (
    <TouchableRipple onPress={action} rippleColor="rgba(0, 0, 0, .32)">
      <View style={style.wrapper}>
        <Icon
          name={iconName}
          color={iconColor ?? colors.text}
          size={fontSizeConst.biggest}></Icon>
        <ThemeText
          style={style.text}>
          {title}
        </ThemeText>
      </View>
    </TouchableRipple>
  );
}

const style = StyleSheet.create({
  wrapper: {
    width: rpx(128),
    height: rpx(128),
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    marginTop: rpx(12),
    fontSize: fontSizeConst.small,
    fontWeight: fontWeightConst.bold
  },
});
