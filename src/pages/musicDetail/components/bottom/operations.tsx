import React from 'react';
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
import Toast from '@/utils/toast';
import Config from '@/core/config';
import TrackPlayer from 'react-native-track-player';
import useOrientation from '@/hooks/useOrientation';

export default function Opertions() {
    //briefcase-download-outline  briefcase-check-outline checkbox-marked-circle-outline
    const favoriteMusicSheet = MusicSheet.useSheets('favorite');
    const musicItem = MusicQueue.useCurrentMusicItem();
    const currentQuality = MusicQueue.useCurrentQuality();
    const isDownloaded = LocalMusicSheet.useIsLocal(musicItem);
    const {showPanel} = usePanel();
    const rate = Config.useConfig('status.music.rate') ?? 100;
    const orientation = useOrientation();

    const musicIndexInFav =
        favoriteMusicSheet?.musicList.findIndex(_ =>
            isSameMediaItem(_, musicItem),
        ) ?? -1;

    return (
        <View
            style={[
                style.wrapper,
                orientation === 'horizonal'
                    ? {
                          marginBottom: 0,
                      }
                    : null,
            ]}>
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
                    if (!musicItem) {
                        return;
                    }
                    showPanel('MusicQuality', {
                        musicItem,
                        async onQualityPress(quality) {
                            const changeResult = await MusicQueue.changeQuality(
                                quality,
                            );
                            if (!changeResult) {
                                Toast.warn('当前暂无此音质音乐');
                            }
                        },
                    });
                }}>
                <Image
                    source={ImgAsset.quality[currentQuality]}
                    style={style.quality}
                />
            </Pressable>
            <Icon
                name={isDownloaded ? 'check-circle-outline' : 'download'}
                size={rpx(48)}
                color="white"
                onPress={() => {
                    if (musicItem && !isDownloaded) {
                        showPanel('MusicQuality', {
                            musicItem,
                            async onQualityPress(quality) {
                                Download.downloadMusic(musicItem, quality);
                            },
                        });
                    }
                }}
            />
            <Pressable
                onPress={() => {
                    if (!musicItem) {
                        return;
                    }
                    showPanel('PlayRate', {
                        async onRatePress(newRate) {
                            if (rate !== newRate) {
                                try {
                                    await TrackPlayer.setRate(newRate / 100);
                                    Config.set('status.music.rate', newRate);
                                } catch {}
                            }
                        },
                    });
                }}>
                <Image source={ImgAsset.rate[rate]} style={style.quality} />
            </Pressable>
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
        width: '100%',
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
