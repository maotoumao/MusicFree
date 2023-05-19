import React, {useMemo} from 'react';
import rpx from '@/utils/rpx';
import MusicQueue from '@/core/musicQueue';
import {ImgAsset} from '@/constants/assetsConst';
import FastImage from '@/components/base/fastImage';
import useOrientation from '@/hooks/useOrientation';
import {Gesture, GestureDetector} from 'react-native-gesture-handler';
import imageViewer from '@/components/imageViewer';

export default function AlbumCover() {
    const musicItem = MusicQueue.useCurrentMusicItem();
    const orientation = useOrientation();

    const artworkStyle = useMemo(() => {
        if (orientation === 'vertical') {
            return {
                width: rpx(500),
                height: rpx(500),
            };
        } else {
            return {
                width: rpx(260),
                height: rpx(260),
            };
        }
    }, [orientation]);

    const longPress = Gesture.LongPress()
        .onStart(() => {
            imageViewer.show(musicItem.artwork);
        })
        .runOnJS(true);

    return (
        <GestureDetector gesture={longPress}>
            <FastImage
                style={artworkStyle}
                uri={musicItem?.artwork}
                emptySrc={ImgAsset.albumDefault}
            />
        </GestureDetector>
    );
}
