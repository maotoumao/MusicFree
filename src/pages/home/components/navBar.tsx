import {ROUTE_PATH} from '@/entry/router';
import {useNavigation} from '@react-navigation/native';
import React from 'react';
import {
  Pressable,
  StyleSheet,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import rpx from '@/utils/rpx';
import {Appbar} from 'react-native-paper';
import {iconSizeConst} from '@/constants/uiConst';
import color from 'color';
import useColors from '@/hooks/useColors';
import ThemeText from '@/components/themeText';

// todo icon: = musicFree(引入自定义字体 居中) search
export default function NavBar() {
  const navigation = useNavigation<any>();
  const colors = useColors();
  return (
    <Appbar style={style.appbar}>
      <Appbar.Action
        icon="menu"
        color={colors.text}
        size={iconSizeConst.normal}
        onPress={() => {
          navigation?.openDrawer();
        }}
      />
      <Pressable
        style={[
          style.searchBar,
          {
            backgroundColor: color(colors.placeholder)
              .negate()
              .mix(color('#999999'))
              .alpha(0.7)
              .toString(),
          },
        ]}
        onPress={() => {
          navigation.navigate(ROUTE_PATH.SEARCH_PAGE);
        }}>
        <Icon
          name="magnify"
          size={rpx(28)}
          color={colors.placeholder}
          style={style.searchIcon}></Icon>
        <ThemeText fontSize='subTitle' style={[style.text, {color: colors.textPlaceholder}]}>
          点击这里开始搜索
        </ThemeText>
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
    height: rpx(72),
    borderRadius: rpx(36),
    paddingHorizontal: rpx(28),
  },
  searchIcon: {},
  text: {
    marginLeft: rpx(12)
  },
});
