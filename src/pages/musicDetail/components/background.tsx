import React from 'react';
import {Image, StyleSheet, View} from 'react-native';
import MusicQueue from '@/core/musicQueue';

export default function Background() {
    const musicItem = MusicQueue.useCurrentMusicItem();
    return (
        <>
            {musicItem?.artwork && (
                <>
                    <View style={style.background} />
                    <Image
                        style={style.blur}
                        blurRadius={50}
                        source={{
                            uri: musicItem.artwork,
                        }}
                    />
                </>
            )}
        </>
    );
}

const style = StyleSheet.create({
    background: {
        width: '100%',
        height: '100%',
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: '#000',
    },
    blur: {
        width: '100%',
        height: '100%',
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        opacity: 0.5,
    },
});
