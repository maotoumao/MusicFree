import React, {memo} from 'react';
import {FlatList, StyleSheet, ListRenderItem} from 'react-native';
import MusicSheet from '@/core/musicSheet';
import {ROUTE_PATH, useNavigate} from '@/entry/router';
import ListItem from '@/components/base/listItem';
import {ImgAsset} from '@/constants/assetsConst';
import Toast from '@/utils/toast';
import sheetHeader from './sheetHeader';
import rpx from '@/utils/rpx';
import useOrientation from '@/hooks/useOrientation';
import {showDialog} from '@/components/dialogs/useDialog';
import useColors from '@/hooks/useColors';

function MySheets() {
    const orientation = useOrientation();
    const musicSheets = MusicSheet.useUserSheets();
    const navigate = useNavigate();
    const colors = useColors();

    const renderMySheetItem: ListRenderItem<IMusic.IMusicSheetItem> =
        function ({item: sheet}) {
            return (
                <ListItem
                    key={`${sheet.id}`}
                    withHorizonalPadding
                    onPress={() => {
                        navigate(ROUTE_PATH.LOCAL_SHEET_DETAIL, {
                            id: sheet.id,
                        });
                    }}>
                    <ListItem.ListItemImage
                        uri={sheet.coverImg}
                        fallbackImg={ImgAsset.albumDefault}
                    />
                    <ListItem.Content
                        title={sheet.title}
                        description={`${sheet.musicList.length ?? '-'}首`}
                    />
                    <ListItem.ListItemIcon
                        position="right"
                        icon="trash-can-outline"
                        onPress={() => {
                            showDialog('SimpleDialog', {
                                title: '删除歌单',
                                content: `确定删除歌单「${sheet.title}」吗?`,
                                onOk: async () => {
                                    await MusicSheet.removeSheet(sheet.id);
                                    Toast.success('已删除');
                                },
                            });
                        }}
                    />
                </ListItem>
            );
        };

    return (
        <FlatList
            overScrollMode="never"
            ListHeaderComponent={sheetHeader}
            style={[
                style.wrapper,
                orientation === 'horizonal'
                    ? style.horizonalWrapper
                    : undefined,
                {
                    backgroundColor: colors.card,
                },
            ]}
            data={musicSheets ?? []}
            keyExtractor={sheet => sheet.id}
            renderItem={renderMySheetItem}
        />
    );
}

export default memo(MySheets, () => true);

const style = StyleSheet.create({
    wrapper: {
        flexGrow: 1,
        marginHorizontal: rpx(24),
        paddingBottom: rpx(64),
        marginBottom: rpx(24),
        borderRadius: rpx(24),
    },
    horizonalWrapper: {
        marginTop: rpx(12),
    },
});
