import React from 'react';
import {StyleSheet} from 'react-native';
import rpx from '@/utils/rpx';
import {useNavigation, useTheme} from '@react-navigation/native';
import {Appbar} from 'react-native-paper';
import ThemeText from '@/components/base/themeText';

interface IComplexAppBarProps {
  title?: string;
  onSearchPress?: () => void;
}
export default function AppBarWithSearch(props: IComplexAppBarProps) {
  const navigation = useNavigation();
  const {title, onSearchPress} = props;
  const {colors} = useTheme();

  return (
    <Appbar.Header style={[style.appbar, {backgroundColor: colors.primary}]}>
      <Appbar.BackAction
        onPress={() => {
          navigation.goBack();
        }}
      />
      <Appbar.Content title={title} />
      <Appbar.Action icon="magnify" onPress={onSearchPress} />
      <Appbar.Action icon={'dots-vertical'} onPress={() => {}} />
    </Appbar.Header>
  );
}

const style = StyleSheet.create({
  wrapper: {
    width: rpx(750),
    flex: 1,
  },
  appbar: {
    shadowColor: 'transparent',
    backgroundColor: '#2b333eaa',
  },
  header: {
    backgroundColor: 'transparent',
    shadowColor: 'transparent',
  },
});
