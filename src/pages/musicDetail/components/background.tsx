import React from 'react';
import {Image, StyleSheet} from 'react-native';
import MusicQueue from '@/core/musicQueue';

export default function Background() {
    const musicItem = MusicQueue.useCurrentMusicItem();
    return (
        <>
            {musicItem?.artwork && (
                <Image
                    style={style.blur}
                    blurRadius={18}
                    source={{
                        uri: musicItem.artwork,
                    }}
                />
            )}
        </>
    );
}

const style = StyleSheet.create({
    blur: {
        width: '100%',
        height: '100%',
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        opacity: 0.6,
    },
});
