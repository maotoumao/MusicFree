import React from 'react';
import {StyleSheet} from 'react-native';
import rpx from '@/utils/rpx';
import MusicQueue from '@/core/musicQueue';
import {ImgAsset} from '@/constants/assetsConst';
import FastImage from '@/components/base/fastImage';

export default function AlbumCover() {
    const musicItem = MusicQueue.useCurrentMusicItem();
    return (
        // todo: 封装一层
        <FastImage
            style={style.artwork}
            uri={musicItem?.artwork}
            emptySrc={ImgAsset.albumDefault}
        />
    );
}

const style = StyleSheet.create({
    artwork: {
        width: rpx(500),
        height: rpx(500),
    },
});
