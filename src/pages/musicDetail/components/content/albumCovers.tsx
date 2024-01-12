import React, {useMemo} from 'react';
import rpx from '@/utils/rpx';
import {ImgAsset} from '@/constants/assetsConst';
import FastImage from '@/components/base/fastImage';
import useOrientation from '@/hooks/useOrientation';
import {Gesture, GestureDetector} from 'react-native-gesture-handler';
import imageViewer from '@/components/imageViewer';
import TrackPlayer from '@/core/trackPlayer';

export default function AlbumCover() {
    const musicItem = TrackPlayer.useCurrentMusic();
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
            if (musicItem?.artwork) {
                imageViewer.show(musicItem.artwork);
            }
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
