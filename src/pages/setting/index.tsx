import React from 'react';
import { StyleSheet} from 'react-native';
import rpx from '@/utils/rpx';
import {useRoute} from '@react-navigation/native';
import settingTypes from './settingTypes';
import { SafeAreaView } from 'react-native-safe-area-context';
import StatusBar from '@/components/base/statusBar';
import SimpleAppBar from '@/components/base/simpleAppBar';

interface ISettingProps {}
export default function Setting(props: ISettingProps) {
  const route = useRoute<any>();
  const type: string = route.params?.type;
  const settingItem = settingTypes[type];


  return (
    <SafeAreaView style={style.wrapper}>
      <StatusBar></StatusBar>
      <SimpleAppBar title={settingItem?.title}></SimpleAppBar>
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
  },
});
