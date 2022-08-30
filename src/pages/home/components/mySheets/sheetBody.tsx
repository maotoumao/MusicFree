import React from 'react';
import {FlatList, StyleSheet} from 'react-native';
import MusicSheet from '@/common/musicSheetManager';
import {useNavigation} from '@react-navigation/native';
import {ROUTE_PATH} from '@/entry/router';
import useDialog from '@/components/dialogs/useDialog';
import ListItem from '@/components/base/listItem';
import IconButton from '@/components/base/iconButton';
import { ImgAsset } from '@/constants/assetsConst';

interface ISheetBodyProps {}
export default function SheetBody(props: ISheetBodyProps) {
  const musicSheets = MusicSheet.useUserSheets();
  const navigation = useNavigation<any>();
  const {showDialog} = useDialog();

  return (
    <FlatList
      style={style.wrapper}
      data={musicSheets ?? []}
      keyExtractor={sheet => sheet.id}
      renderItem={({item: sheet}) => (
        <ListItem
          key={`${sheet.id}`}
          title={sheet.title}
          itemPaddingHorizontal={0}
          left={{
            artwork: sheet.coverImg,
            fallback: ImgAsset.albumDefault,
          }}
          onPress={() => {
            navigation.navigate(ROUTE_PATH.SHEET_DETAIL, {
              id: sheet.id,
            });
          }}
          right={() => (
            <IconButton
              name="dots-vertical"
              onPress={() => {
                showDialog('simple-dialog', {
                  title: '删除歌单',
                  content: `确定删除歌单${sheet.title}吗?`,
                  onOk: () => {
                    MusicSheet.removeSheet(sheet.id);
                  },
                });
              }}
              fontColor='secondary'></IconButton>
          )}
          desc={`${sheet.musicList.length ?? '-'}首`}></ListItem>
      )}></FlatList>
  );
}

const style = StyleSheet.create({
  wrapper: {
    width: '100%',
    flex: 1,
  },
});
