import React from 'react';
import {StyleSheet} from 'react-native';
import rpx from '@/utils/rpx';
import ListItem from '@/components/base/listItem';
import useColors from '@/hooks/useColors';
import MusicSheet from '@/core/musicSheet';
import {ImgAsset} from '@/constants/assetsConst';
import {TouchableOpacity} from 'react-native-gesture-handler';
import {ROUTE_PATH, useNavigate} from '@/entry/router';

export default function FavoriteMusicList() {
    const colors = useColors();
    const favoriteMusicList = MusicSheet.useSheets('favorite');
    const navigate = useNavigate();

    console.log(favoriteMusicList);

    return (
        <TouchableOpacity
            style={styles.container}
            onPress={() => {
                navigate(ROUTE_PATH.LOCAL_SHEET_DETAIL, {
                    id: 'favorite',
                });
            }}>
            <ListItem
                withHorizonalPadding
                heightType="big"
                style={[styles.itemContainer, {backgroundColor: colors.card}]}>
                <ListItem.ListItemImage
                    uri={favoriteMusicList.coverImg}
                    fallbackImg={ImgAsset.albumDefault}
                />
                <ListItem.Content
                    title="我喜欢"
                    description={`${favoriteMusicList.musicList.length}首`}
                />
            </ListItem>
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    container: {
        width: rpx(750),
        paddingHorizontal: rpx(24),
        marginBottom: rpx(32),
    },
    itemContainer: {
        borderRadius: rpx(18),
        height: rpx(144),
    },
    heart: {
        position: 'absolute',
        left: rpx(32),
    },
});
