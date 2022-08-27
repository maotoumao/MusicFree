import React from 'react';
import {Appbar} from 'react-native-paper';
import {StyleSheet} from 'react-native';
import rpx from '@/utils/rpx';
import {useNavigation} from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface IProps {}
export default function (props: IProps) {
  const navigation = useNavigation();

  return (
    <SafeAreaView style={style.wrapper}>
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
    </SafeAreaView>
  );
}

const style = StyleSheet.create({
  wrapper: {
    backgroundColor: '#2b333eaa',
  },
  appbar: {
    backgroundColor: '#2b333eaa',
    shadowColor: 'transparent',
    flexDirection: 'row',
    width: rpx(750),
  },
});
