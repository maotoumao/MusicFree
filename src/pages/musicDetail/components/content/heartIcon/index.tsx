import React from 'react';
import {iconSizeConst} from '@/constants/uiConst';
import MusicSheet from '@/core/musicSheet';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import TrackPlayer from '@/core/trackPlayer';

export default function () {
    const musicItem = TrackPlayer.useCurrentMusic();

    const favIndex = MusicSheet.useMusicFavIndex(musicItem);

    return favIndex !== -1 ? (
        <Icon
            name="heart"
            size={iconSizeConst.normal}
            color="red"
            onPress={() => {
                MusicSheet.removeMusicByIndex('favorite', favIndex);
            }}
        />
    ) : (
        <Icon
            name="heart-outline"
            size={iconSizeConst.normal}
            color="white"
            onPress={() => {
                if (musicItem) {
                    MusicSheet.addMusic('favorite', musicItem);
                }
            }}
        />
    );
}
