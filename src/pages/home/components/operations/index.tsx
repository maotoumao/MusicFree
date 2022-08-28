import {produce} from 'immer';
import {useSetAtom} from 'jotai';
import React, {type PropsWithChildren} from 'react';
import {Button, ScrollView, StyleSheet, Text, View} from 'react-native';
import {themeStateAtom} from '@/store/themeState';
import rpx from '@/utils/rpx';
import ActionButton from './ActionButton';
import {useNavigation} from '@react-navigation/native';
import {ROUTE_PATH} from '@/entry/router';

export default function Operations() {
  const navigation = useNavigation<any>();

  const actionButtons = [
    {
      iconName: 'heart',
      iconColor: 'red',
      title: '我喜欢',
      action() {
        navigation.navigate(ROUTE_PATH.SHEET_DETAIL, {
          id: 'favorite',
        });
      },
    },
    {
      iconName: 'ios-file-tray-sharp',
      title: '本地音乐',
      action() {
        console.log('本地音乐');
      },
    },
    // {
    //   iconName: 'ios-time-sharp',
    //   title: '最近播放',
    //   action(){
    //     console.log('最近');
    //   }
    // },
    {
      iconName: 'ios-cloud-download',
      title: '下载队列',
      action() {
        console.log('下载');
      },
    },
  ];

  return (
    <View style={style.wrapper}>
      {actionButtons.map(action => (
        <ActionButton key={action.title} {...action}></ActionButton>
      ))}
    </View>
  );
}

const style = StyleSheet.create({
  wrapper: {
    width: rpx(750),
    flexDirection: 'row',
    height: rpx(144),
    justifyContent: 'space-between',
    paddingHorizontal: rpx(24),
    marginTop: rpx(24),
  },
});
