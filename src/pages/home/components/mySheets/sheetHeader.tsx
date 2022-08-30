import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import rpx from '@/utils/rpx';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import useTextColor from '@/hooks/useTextColor';
import MusicSheet from '@/common/musicSheetManager';
import usePanel from '@/components/panels/usePanel';
import { useTheme } from 'react-native-paper';
import IconButton from '@/components/base/iconButton';
import ThemeText from '@/components/base/themeText';

interface IProps {}
export default function (props: IProps) {
  const musicSheets = MusicSheet.useUserSheets();
  const {colors} = useTheme()

  const {showPanel} = usePanel();

  return (
    <View style={style.header}>
      <ThemeText fontSize='subTitle'>
        我的歌单({musicSheets.length ?? '-'}个)
      </ThemeText>
      <View style={style.more}>
        <IconButton
          name="plus"
          size='normal'
          onPress={() => {
            showPanel('NewMusicSheet');
          }}></IconButton>
        <IconButton
          style={style.headerAction}
          name="dots-vertical"
          onPress={() => {
            console.log('more歌单');
          }}></IconButton>
      </View>
    </View>
  );
}

const style = StyleSheet.create({
  header: {
    marginTop: rpx(12),
    flexDirection: 'row',
    height: rpx(72),
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  more: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    flexGrow: 1,
  },
  headerAction: {
    marginLeft: rpx(14),
  },
});
