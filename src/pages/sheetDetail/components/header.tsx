import React from 'react';
import {StyleSheet, View} from 'react-native';
import rpx from '@/utils/rpx';
import MusicSheet from '@/core/musicSheet';
import LinearGradient from 'react-native-linear-gradient';
import ThemeText from '@/components/base/themeText';
import Color from 'color';
import {useTheme} from 'react-native-paper';
import {ImgAsset} from '@/constants/assetsConst';
import FastImage from '@/components/base/fastImage';
import {useParams} from '@/entry/router';

export default function Header() {
    const {id = 'favorite'} = useParams<'sheet-detail'>();
    const sheet = MusicSheet.useSheets(id);
    const {colors} = useTheme();

    return (
        <LinearGradient
            colors={[
                Color(colors.primary).alpha(0.8).toString(),
                Color(colors.primary).alpha(0.15).toString(),
            ]}
            style={style.wrapper}>
            <View style={style.content}>
                <FastImage
                    style={style.coverImg}
                    uri={sheet?.coverImg}
                    emptySrc={ImgAsset.albumDefault}
                />
                <View style={style.details}>
                    <ThemeText fontSize="title">{sheet?.title}</ThemeText>
                    <ThemeText fontColor="secondary" fontSize="subTitle">
                        共{sheet?.musicList.length ?? 0}首
                    </ThemeText>
                </View>
            </View>
        </LinearGradient>
    );
}

const style = StyleSheet.create({
    wrapper: {
        width: rpx(750),
        height: rpx(300),
        justifyContent: 'center',
        alignItems: 'center',
        flexDirection: 'row',
    },
    content: {
        width: rpx(702),
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    coverImg: {
        width: rpx(210),
        height: rpx(210),
        borderRadius: rpx(24),
    },
    details: {
        width: rpx(456),
        height: rpx(140),
        justifyContent: 'space-between',
    },
});
