import React from 'react';
import {Appbar} from 'react-native-paper';
import {StyleSheet, Text, View} from 'react-native';
import rpx from '@/utils/rpx';
import {useNavigation} from '@react-navigation/native';
import getStatusBarHeight from '@/utils/getStatusBarHeight';
import usePrimaryColor from '@/hooks/usePrimaryColor';

interface IProps {}
export default function (props: IProps) {
  const navigation = useNavigation();
  const primaryColor = usePrimaryColor();

  return (
    <View style={[style.wrapper, {backgroundColor: primaryColor}]}>
      <Appbar.Header style={[style.appbar, {backgroundColor: primaryColor}]}>
        <Appbar.BackAction
          onPress={() => {
            navigation.goBack();
          }}
        />
        <Appbar.Content title="歌单" />
        <Appbar.Action icon="magnify" onPress={() => {}} />
        <Appbar.Action icon={'dots-vertical'} onPress={() => {}} />
      </Appbar.Header>
    </View>
  );
}

const style = StyleSheet.create({
  wrapper: {
    paddingTop: getStatusBarHeight(),
  },
  appbar: {
    shadowColor: 'transparent',
    flexDirection: 'row',
    width: rpx(750),
  },
});
