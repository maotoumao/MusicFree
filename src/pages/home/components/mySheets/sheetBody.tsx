import React from 'react';
import {Image, ScrollView, StyleSheet, Text, View} from 'react-native';
import rpx from '@/utils/rpx';
import MusicSheet from '@/common/musicSheet';
import {List} from 'react-native-paper';
import {useNavigation} from '@react-navigation/native';
import {ROUTE_PATH} from '@/entry/router';
import MusicSheetItem from '@/components/musicSheetListItem';
import useDialog from '@/components/dialogs/useDialog';

interface ISheetBodyProps {}
export default function SheetBody(props: ISheetBodyProps) {
  const musicSheets = MusicSheet.useUserSheets();
  const navigation = useNavigation<any>();
  const {showDialog} = useDialog();

  return (
    <ScrollView style={style.wrapper}>
      {musicSheets?.map(sheet => (
        <MusicSheetItem
          key={`${sheet.id}`}
          title={sheet.title}
          coverImg={sheet.coverImg}
          desc={`${sheet.musicList.length ?? '-'}首`}
          onPress={() => {
            navigation.navigate(ROUTE_PATH.SHEET_DETAIL, {
              id: sheet.id,
            });
          }}
          rightIconName='trash-can-outline'
          onRightIconPress={() => {
            showDialog('simple-dialog', {
              title: '删除歌单',
              content: `确认删除歌单 ${sheet.title} 吗?`,
              onOk:()=>{
                MusicSheet.removeSheet(sheet.id);
              }
            })
          }}></MusicSheetItem>
      ))}
    </ScrollView>
  );
}

const style = StyleSheet.create({
  wrapper: {
    width: '100%',
    flex: 1,
  },
});
