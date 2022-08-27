import React from 'react';
import {Appbar} from 'react-native-paper';
import {StyleSheet} from 'react-native';
import rpx from '@/utils/rpx';
import {useNavigation} from '@react-navigation/native';
import {SafeAreaView} from 'react-native-safe-area-context';
import useColors from '@/hooks/useColors';

interface IProps {}
export default function (props: IProps) {
  const navigation = useNavigation();
  const colors = useColors()

  return (
    <Appbar.Header style={[style.appbar, {backgroundColor: colors.primary}]}>
      <Appbar.BackAction
        onPress={() => {
          navigation.goBack();
        }}
      />
      <Appbar.Content title="专辑" />
      <Appbar.Action icon="magnify" onPress={() => {}} />
      <Appbar.Action icon={'dots-vertical'} onPress={() => {}} />
    </Appbar.Header>
  );
}

const style = StyleSheet.create({
  appbar: {
    shadowColor: 'transparent',
    flexDirection: 'row',
    width: rpx(750),
  },
});
