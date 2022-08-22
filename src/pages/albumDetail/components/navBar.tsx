import React from 'react';
import {Appbar} from 'react-native-paper';
import {StyleSheet, Text, View} from 'react-native';
import rpx from '@/utils/rpx';
import {useNavigation} from '@react-navigation/native';
import getStatusBarHeight from '@/utils/getStatusBarHeight';

interface IProps {}
export default function (props: IProps) {
  const navigation = useNavigation();

  return (
    <View style={style.wrapper}>
      <Appbar.Header style={style.appbar}>
        <Appbar.BackAction
          onPress={() => {
            navigation.goBack();
          }}
        />
        <Appbar.Content title="专辑" />
        <Appbar.Action icon="magnify" onPress={() => {}} />
        <Appbar.Action icon={'dots-vertical'} onPress={() => {}} />
      </Appbar.Header>
    </View>
  );
}

const style = StyleSheet.create({
  wrapper: {
    paddingTop: getStatusBarHeight(),
    backgroundColor: '#2b333eaa',
  },
  appbar: {
    backgroundColor: '#2b333eaa',
    shadowColor: 'transparent',
    flexDirection: 'row',
    width: rpx(750),
  },
});
