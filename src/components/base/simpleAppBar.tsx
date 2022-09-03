import React from 'react';
import {StyleSheet} from 'react-native';
import rpx from '@/utils/rpx';
import {useNavigation, useTheme} from '@react-navigation/native';
import {Appbar} from 'react-native-paper';
import ThemeText from '@/components/base/themeText';

interface ISimpleAppBarProps {
  title?: string;
}
export default function SimpleAppBar(props: ISimpleAppBarProps) {
  const navigation = useNavigation();
  const {title} = props;
  const {colors} = useTheme();

  return (
    <Appbar style={[style.appbar, {backgroundColor: colors.primary}]}>
      <Appbar.BackAction
        color={colors.text}
        onPress={() => {
          navigation.goBack();
        }}></Appbar.BackAction>
      <Appbar.Header style={style.header}>
        <ThemeText style={style.header} fontSize="title" fontWeight="semibold">
          {title ?? ''}
        </ThemeText>
      </Appbar.Header>
    </Appbar>
  );
}

const style = StyleSheet.create({
  appbar: {
    shadowColor: 'transparent',
    backgroundColor: '#2b333eaa',
    zIndex: 10000
  },
  header: {
    backgroundColor: 'transparent',
    shadowColor: 'transparent',
  },
});
