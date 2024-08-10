import React from 'react';
import {iconSizeConst} from '@/constants/uiConst';
import TrackPlayer from '@/core/trackPlayer';
import Icon from '@/components/base/icon.tsx';
import MusicSheet from '@/core/musicSheet';

export default function () {
    const musicItem = TrackPlayer.useCurrentMusic();

    const isFavorite = MusicSheet.useFavorite(musicItem);

    return isFavorite ? (
        <Icon
            name="heart"
            size={iconSizeConst.normal}
            color="red"
            onPress={() => {
                if (!musicItem) {
                    return;
                }
                MusicSheet.removeMusic(MusicSheet.defaultSheet.id, musicItem);
            }}
        />
    ) : (
        <Icon
            name="heart-outline"
            size={iconSizeConst.normal}
            color="white"
            onPress={() => {
                if (musicItem) {
                    MusicSheet.addMusic(MusicSheet.defaultSheet.id, musicItem);
                }
            }}
        />
    );
}
