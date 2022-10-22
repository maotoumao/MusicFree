import React from 'react';
import {FlatList, StyleSheet} from 'react-native';
import MusicSheet from '@/core/musicSheet';
import {ROUTE_PATH, useNavigate} from '@/entry/router';
import useDialog from '@/components/dialogs/useDialog';
import ListItem from '@/components/base/listItem';
import IconButton from '@/components/base/iconButton';
import {ImgAsset} from '@/constants/assetsConst';
import Toast from '@/utils/toast';

export default function SheetBody() {
    const musicSheets = MusicSheet.useUserSheets();
    const navigate = useNavigate();
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
                        navigate(ROUTE_PATH.SHEET_DETAIL, {
                            id: sheet.id,
                        });
                    }}
                    right={() => (
                        <IconButton
                            name="trash-can-outline"
                            onPress={() => {
                                showDialog('SimpleDialog', {
                                    title: '删除歌单',
                                    content: `确定删除歌单${sheet.title}吗?`,
                                    onOk: async () => {
                                        await MusicSheet.removeSheet(sheet.id);
                                        Toast.success('已删除');
                                    },
                                });
                            }}
                            fontColor="secondary"
                        />
                    )}
                    desc={`${sheet.musicList.length ?? '-'}首`}
                />
            )}
        />
    );
}

const style = StyleSheet.create({
    wrapper: {
        width: '100%',
        flex: 1,
    },
});
