import React from 'react';
import {Appbar} from 'react-native-paper';
import {StyleSheet, View} from 'react-native';
import rpx from '@/utils/rpx';
import {useNavigation, useRoute} from '@react-navigation/native';
import usePrimaryColor from '@/hooks/usePrimaryColor';
import AppBarWithSearch from '@/components/base/appBarWithSearch';
import MusicSheet from '@/common/musicSheetManager';
import {ROUTE_PATH} from '@/entry/router';
import useDialog from '@/components/dialogs/useDialog';

interface IProps {}
export default function (props: IProps) {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const id = route.params?.id ?? 'favorite';
  const musicSheet = MusicSheet.useSheets(id);
  const {showDialog} = useDialog();

  return (
    <AppBarWithSearch
      title="歌单"
      onSearchPress={() => {
        navigation.navigate(ROUTE_PATH.SEARCH_MUSIC_LIST, {
          musicList: musicSheet?.musicList,
        });
      }}
      menuOptions={[
        {
          icon: 'trash-can-outline',
          title: '删除歌单',
          show: id !== 'favorite',
          onPress() {
            showDialog('SimpleDialog', {
              title: '删除歌单',
              content: `确定删除歌单${musicSheet.title}吗?`,
              onOk: async () => {
                await MusicSheet.removeSheet(id);
                navigation.goBack();
              },
            });
          },
        },
      ]}></AppBarWithSearch>
  );
}

const style = StyleSheet.create({
  appbar: {
    shadowColor: 'transparent',
    flexDirection: 'row',
    width: rpx(750),
  },
});
