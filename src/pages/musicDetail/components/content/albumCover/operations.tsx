import React from 'react';
import {Image, Pressable, StyleSheet, View} from 'react-native';
import rpx from '@/utils/rpx';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

import Download from '@/core/download';
import LocalMusicSheet from '@/core/localMusicSheet';
import {ROUTE_PATH} from '@/entry/router';
import {ImgAsset} from '@/constants/assetsConst';
import Toast from '@/utils/toast';
import useOrientation from '@/hooks/useOrientation';
import {showPanel} from '@/components/panels/usePanel';
import TrackPlayer from '@/core/trackPlayer';
import {iconSizeConst} from '@/constants/uiConst';
import PersistStatus from '@/core/persistStatus';
import HeartIcon from '../heartIcon';

export default function Operations() {
    //briefcase-download-outline  briefcase-check-outline checkbox-marked-circle-outline
    const musicItem = TrackPlayer.useCurrentMusic();
    const currentQuality = TrackPlayer.useCurrentQuality();
    const isDownloaded = LocalMusicSheet.useIsLocal(musicItem);

    const rate = PersistStatus.useValue('music.rate', 100);
    const orientation = useOrientation();

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
            <HeartIcon />
            <Pressable
                onPress={() => {
                    if (!musicItem) {
                        return;
                    }
                    showPanel('MusicQuality', {
                        musicItem,
                        async onQualityPress(quality) {
                            const changeResult =
                                await TrackPlayer.changeQuality(quality);
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
                size={iconSizeConst.normal}
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
                                    PersistStatus.set('music.rate', newRate);
                                } catch {}
                            }
                        },
                    });
                }}>
                <Image source={ImgAsset.rate[rate!]} style={style.quality} />
            </Pressable>
            <Icon
                name="dots-vertical"
                size={iconSizeConst.normal}
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
