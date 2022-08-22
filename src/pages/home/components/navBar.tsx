import {ROUTE_PATH} from '@/entry/router';
import {useNavigation} from '@react-navigation/native';
import React, {type PropsWithChildren} from 'react';
import {
  Button,
  Pressable,
  StyleSheet,
  Text,
  ToastAndroid,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import rpx from '@/utils/rpx';
import RNFS from 'react-native-fs';
import {Appbar, useTheme} from 'react-native-paper';
import { fontSizeConst } from '@/constants/uiConst';
import color from 'color';

// todo icon: = musicFree(引入自定义字体 居中) search
export default function NavBar() {
  const navigation = useNavigation<any>();
  const {colors} = useTheme();
  return (
    <Appbar style={style.appbar}>
      <Appbar.Action
        icon="menu"
        color={colors.text}
        onPress={() => {
            navigation?.openDrawer();
        }}
      />
      <Pressable
        style={[style.searchBar, {backgroundColor: color(colors.placeholder).negate().mix(color('#999999')).alpha(0.7).toString()}]}
        onPress={() => {
          navigation.navigate(ROUTE_PATH.SEARCH_PAGE);
        }}>
        <Icon
          name="magnify"
          size={rpx(28)}
          color={colors.placeholder}
          style={style.searchIcon}></Icon>
        <Text style={[style.text, {color: colors.placeholder}]}>点击这里开始搜索</Text>
      </Pressable>
    </Appbar>
  );
}

const style = StyleSheet.create({
  appbar: {
    backgroundColor: 'transparent',
    shadowColor: 'transparent',
    flexDirection: 'row',
    width: rpx(750),
  },
  searchBar: {
    marginHorizontal: rpx(24),
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    height: rpx(48),
    borderRadius: rpx(24),
  },
  searchIcon: {
    marginLeft: rpx(16),
  },
  text: {
    marginLeft: rpx(6),
    fontSize: fontSizeConst.small,
  },
});
