import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import rpx from '@/utils/rpx';
import {useNavigation, useRoute, useTheme} from '@react-navigation/native';
import {Appbar} from 'react-native-paper';
import getStatusBarHeight from '@/utils/getStatusBarHeight';
import settingTypes from './settingTypes';
import {fontSizeConst, fontWeightConst} from '@/constants/uiConst';
import ThemeText from '@/components/themeText';
import useTextColor from '@/hooks/useTextColor';

interface ISettingProps {}
export default function Setting(props: ISettingProps) {
  const route = useRoute<any>();
  const navigation = useNavigation();
  const type: string = route.params?.type;
  const settingItem = settingTypes[type];

  const {colors} = useTheme();

  return (
    <>
      <View style={style.wrapper}>
        <Appbar style={[style.appbar, {backgroundColor: colors.primary}]}>
          <Appbar.BackAction
            color={colors.text}
            onPress={() => {
              navigation.goBack();
            }}></Appbar.BackAction>
          <Appbar.Header style={style.header}>
            <ThemeText style={style.header}>{settingItem?.title}</ThemeText>
          </Appbar.Header>
        </Appbar>
      </View>
      <settingItem.component></settingItem.component>
    </>
  );
}

const style = StyleSheet.create({
  wrapper: {
    width: rpx(750),
    backgroundColor: '#2b333eaa',
    paddingTop: getStatusBarHeight(),
  },
  appbar: {
    shadowColor: 'transparent',
  },
  header: {
    backgroundColor: 'transparent',
    shadowColor: 'transparent',
    fontSize: fontSizeConst.big,
    fontWeight: fontWeightConst.bold,
  },
});
