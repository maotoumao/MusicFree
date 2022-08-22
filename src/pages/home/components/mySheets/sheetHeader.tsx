import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import rpx from '@/utils/rpx';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import useTextColor from '@/hooks/useTextColor';
import MusicSheet from '@/common/musicSheet';
import usePanelShow from '@/components/panels/usePanelShow';
import { useTheme } from 'react-native-paper';
import { fontSizeConst } from '@/constants/uiConst';

interface IProps {}
export default function (props: IProps) {
  const musicSheets = MusicSheet.useUserSheets();
  const {colors} = useTheme()

  const {showPanel} = usePanelShow();

  return (
    <View style={style.header}>
      <Text style={{color: colors.text}}>
        我的歌单({musicSheets.length ?? '-'}个)
      </Text>
      <View style={style.more}>
        <Icon
          name="plus"
          color={colors.text}
          size={fontSizeConst.bigger}
          onPress={() => {
            showPanel('NewMusicSheet');
          }}></Icon>
        <Icon
          style={style.headerAction}
          color={colors.text}
          name="dots-vertical"
          size={fontSizeConst.bigger}
          onPress={() => {
            console.log('more歌单');
          }}></Icon>
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
