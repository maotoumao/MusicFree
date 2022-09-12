import React from 'react';
import {StyleSheet, View} from 'react-native';
import rpx from '@/utils/rpx';
import MusicSheet from '@/core/musicSheet';
import usePanel from '@/components/panels/usePanel';
import IconButton from '@/components/base/iconButton';
import ThemeText from '@/components/base/themeText';

export default function () {
    const musicSheets = MusicSheet.useUserSheets();

    const {showPanel} = usePanel();

    return (
        <View style={style.header}>
            <ThemeText fontSize="subTitle">
                我的歌单({musicSheets.length ?? '-'}个)
            </ThemeText>
            <View style={style.more}>
                <IconButton
                    name="plus"
                    size="normal"
                    onPress={() => {
                        showPanel('NewMusicSheet');
                    }}
                />
                {/* <IconButton
                    style={style.headerAction}
                    name="dots-vertical"
                    onPress={() => {
                        console.log('more歌单');
                    }}
                /> */}
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
