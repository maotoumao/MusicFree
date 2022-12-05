import React, {useEffect, useState} from 'react';
import {Image, Pressable, StyleSheet, View} from 'react-native';
import rpx from '@/utils/rpx';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import MusicSheet from '@/core/musicSheet';
import MusicQueue from '@/core/musicQueue';
import usePanel from '@/components/panels/usePanel';
import Download from '@/core/download';
import {isSameMediaItem} from '@/utils/mediaItem';
import LocalMusicSheet from '@/core/localMusicSheet';
import {ROUTE_PATH} from '@/entry/router';
import {ImgAsset} from '@/constants/assetsConst';
import {getMusicItemQuality} from '@/utils/qualities';
import Config from '@/core/config';
import Toast from '@/utils/toast';

export default function Opertions() {
    //briefcase-download-outline  briefcase-check-outline checkbox-marked-circle-outline
    const favoriteMusicSheet = MusicSheet.useSheets('favorite');
    const musicItem = MusicQueue.useCurrentMusicItem();
    const isDownloaded = LocalMusicSheet.useIsLocal(musicItem);
    const {showPanel} = usePanel();

    const [currQuality, setCurrQuality] =
        useState<IMusic.IQualityKey>('standard');

    useEffect(() => {
        if (musicItem) {
            const quality = getMusicItemQuality(musicItem);
            setCurrQuality(quality);
        }
    }, [musicItem]);

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
            <Pressable
                onPress={() => {
                    if (!musicItem.qualities) {
                        Toast.warn('当前音乐暂无其他音质');
                        return;
                    }
                    showPanel('MusicQuality', {
                        musicItem,
                        async onQualityPress(quality, available, musicItem) {
                            if (!available) {
                                Toast.warn('当前音乐暂无此音质');
                                return;
                            }
                            const qualitySetting =
                                Config.get(
                                    'setting.basic.defaultPlayQuality',
                                ) ?? 'standard';
                            if (
                                quality !== currQuality &&
                                quality !== qualitySetting
                            ) {
                                // 修改音源，重新播放
                                await Config.set(
                                    'setting.basic.defaultPlayQuality',
                                    quality,
                                );
                                /** 当前进度 */
                                const position = await MusicQueue.getPosition();
                                await MusicQueue.play(musicItem, true);
                                await MusicQueue.seekTo(position);
                            }
                        },
                    });
                }}>
                <Image
                    source={ImgAsset.quality[currQuality]}
                    style={style.quality}
                />
            </Pressable>
            <Icon
                name={isDownloaded ? 'check-circle-outline' : 'download'}
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
                            from: ROUTE_PATH.MUSIC_DETAIL,
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
    quality: {
        width: rpx(52),
        height: rpx(52),
    },
});
