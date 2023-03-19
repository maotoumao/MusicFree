import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import rpx from '@/utils/rpx';
import {IconButton} from 'react-native-paper';
import MusicQueue from '@/core/musicQueue';
import {useNavigation} from '@react-navigation/native';
import Tag from '@/components/base/tag';
import {fontSizeConst, fontWeightConst} from '@/constants/uiConst';
import Share from 'react-native-share';
import {B64Asset} from '@/constants/assetsConst';

export default function NavBar() {
    const navigation = useNavigation();
    const musicItem = MusicQueue.useCurrentMusicItem();
    // const {showShare} = useShare();

    return (
        <View style={style.wrapper}>
            <IconButton
                icon="arrow-left"
                size={rpx(48)}
                color="white"
                onPress={() => {
                    navigation.goBack();
                }}
            />
            <View style={style.headerContent}>
                <Text numberOfLines={1} style={style.headerTitleText}>
                    {musicItem?.title ?? '无音乐'}
                </Text>
                <View style={style.headerDesc}>
                    <Text style={style.headerArtistText} numberOfLines={1}>
                        {musicItem?.artist}
                    </Text>
                    {musicItem?.platform ? (
                        <Tag tagName={musicItem.platform} />
                    ) : null}
                </View>
            </View>
            <IconButton
                icon="share"
                color="white"
                size={rpx(48)}
                onPress={async () => {
                    try {
                        await Share.open({
                            type: 'image/jpeg',
                            title: 'MusicFree-一个插件化的免费音乐播放器',
                            message: 'MusicFree-一个插件化的免费音乐播放器',
                            url: B64Asset.share,
                            subject: 'MusicFree分享',
                        });
                    } catch {}
                }}
            />
        </View>
    );
}

const style = StyleSheet.create({
    wrapper: {
        width: '100%',
        height: rpx(150),
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    headerContent: {
        flex: 1,
        height: rpx(150),
        justifyContent: 'center',
        alignItems: 'center',
    },
    headerTitleText: {
        color: 'white',
        fontWeight: fontWeightConst.semibold,
        fontSize: fontSizeConst.title,
        marginBottom: rpx(12),
        includeFontPadding: false,
    },
    headerDesc: {
        height: rpx(32),
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: rpx(40),
    },
    headerArtistText: {
        color: 'white',
        fontSize: fontSizeConst.subTitle,
        includeFontPadding: false,
    },
});
