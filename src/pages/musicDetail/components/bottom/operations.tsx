import React from 'react';
import {StyleSheet, View} from 'react-native';
import rpx from '@/utils/rpx';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import MusicSheet from '@/core/musicSheet';
import MusicQueue from '@/core/musicQueue';
import usePanel from '@/components/panels/usePanel';
import Download from '@/core/download';
import {isSameMediaItem} from '@/utils/mediaItem';

export default function Opertions() {
    //briefcase-download-outline  briefcase-check-outline checkbox-marked-circle-outline
    const favoriteMusicSheet = MusicSheet.useSheets('favorite');
    const musicItem = MusicQueue.useCurrentMusicItem();
    const isDownloaded = Download.useIsDownloaded(musicItem);
    const {showPanel} = usePanel();

    const musicIndexInFav =
        favoriteMusicSheet?.musicList.findIndex(_ =>
            isSameMediaItem(_, musicItem),
        ) ?? -1;

    return (
        <View style={style.wrapper}>
            {musicIndexInFav !== -1 ? (
                <Icon
                    name="heart"
                    size={rpx(48)}
                    color="red"
                    onPress={() => {
                        MusicSheet.removeMusicByIndex(
                            'favorite',
                            musicIndexInFav,
                        );
                    }}
                />
            ) : (
                <Icon
                    name="heart-outline"
                    size={rpx(48)}
                    color="white"
                    onPress={() => {
                        if (musicItem) {
                            MusicSheet.addMusic('favorite', musicItem);
                        }
                    }}
                />
            )}
            <Icon
                name={
                    isDownloaded
                        ? 'check-circle-outline'
                        : 'download-circle-outline'
                }
                size={rpx(48)}
                color="white"
                onPress={() => {
                    if (musicItem && !isDownloaded) {
                        Download.downloadMusic(musicItem);
                    }
                }}
            />
            <Icon
                name="dots-vertical"
                size={rpx(48)}
                color="white"
                onPress={() => {
                    if (musicItem) {
                        showPanel('MusicItemOptions', {
                            musicItem: musicItem,
                        });
                    }
                }}
            />
        </View>
    );
}

const style = StyleSheet.create({
    wrapper: {
        width: rpx(750),
        height: rpx(80),
        marginBottom: rpx(24),
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-around',
    },
});
