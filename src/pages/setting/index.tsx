import React from 'react';
import {StatusBar, StyleSheet} from 'react-native';
import rpx from '@/utils/rpx';
import {useNavigation, useRoute, useTheme} from '@react-navigation/native';
import {Appbar} from 'react-native-paper';
import settingTypes from './settingTypes';
import {fontSizeConst, fontWeightConst} from '@/constants/uiConst';
import ThemeText from '@/components/themeText';
import { SafeAreaView } from 'react-native-safe-area-context';

interface ISettingProps {}
export default function Setting(props: ISettingProps) {
  const route = useRoute<any>();
  const navigation = useNavigation();
  const type: string = route.params?.type;
  const settingItem = settingTypes[type];

  const {colors} = useTheme();

  return (
    <SafeAreaView style={style.wrapper}>
      <StatusBar></StatusBar>
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
      <settingItem.component></settingItem.component>
    </SafeAreaView>
  );
}

const style = StyleSheet.create({
  wrapper: {
    width: rpx(750),
    flex: 1
  },
  appbar: {
    shadowColor: 'transparent',
    backgroundColor: '#2b333eaa'
  },
  header: {
    backgroundColor: 'transparent',
    shadowColor: 'transparent',
    fontSize: fontSizeConst.big,
    fontWeight: fontWeightConst.bold,
  },
});
