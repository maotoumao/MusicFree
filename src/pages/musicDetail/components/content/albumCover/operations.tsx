import React, {useMemo} from 'react';
import {Image, Pressable, StyleSheet, View} from 'react-native';
import rpx from '@/utils/rpx';

import Download from '@/core/download';
import LocalMusicSheet from '@/core/localMusicSheet';
import {ROUTE_PATH} from '@/entry/router';
import {ImgAsset} from '@/constants/assetsConst';
import Toast from '@/utils/toast';
import toast from '@/utils/toast';
import useOrientation from '@/hooks/useOrientation';
import {showPanel} from '@/components/panels/usePanel';
import TrackPlayer from '@/core/trackPlayer';
import {iconSizeConst} from '@/constants/uiConst';
import PersistStatus from '@/core/persistStatus';
import HeartIcon from '../heartIcon';
import Icon from '@/components/base/icon.tsx';
import PluginManager from '@/core/pluginManager.ts';

export default function Operations() {
    //briefcase-download-outline  briefcase-check-outline checkbox-marked-circle-outline
    const musicItem = TrackPlayer.useCurrentMusic();
    const currentQuality = TrackPlayer.useCurrentQuality();
    const isDownloaded = LocalMusicSheet.useIsLocal(musicItem);

    const rate = PersistStatus.useValue('music.rate', 100);
    const orientation = useOrientation();

    const supportComment = useMemo(() => {
        return !musicItem
            ? false
            : !!PluginManager.getByMedia(musicItem)?.instance?.getMusicComments;
    }, [musicItem]);

    return (
        <View
            style={[
                styles.wrapper,
                orientation === 'horizontal' ? styles.horizontalWrapper : null,
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
                    style={styles.quality}
                />
            </Pressable>
            <Icon
                name={isDownloaded ? 'check-circle-outline' : 'arrow-down-tray'}
                size={iconSizeConst.normal}
                color="white"
                onPress={() => {
                    if (musicItem && !isDownloaded) {
                        showPanel('MusicQuality', {
                            type: 'download',
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
                <Image source={ImgAsset.rate[rate!]} style={styles.quality} />
            </Pressable>
            <Icon
                name="chat-bubble-oval-left-ellipsis"
                size={iconSizeConst.normal}
                color="white"
                opacity={supportComment ? 1 : 0.2}
                onPress={() => {
                    if (!supportComment) {
                        toast.warn('当前歌曲暂无评论');
                        return;
                    }
                    if (musicItem) {
                        showPanel('MusicComment', {
                            musicItem,
                        });
                    }
                }}
            />
            <Icon
                name="ellipsis-vertical"
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

const styles = StyleSheet.create({
    wrapper: {
        width: '100%',
        height: rpx(80),
        marginBottom: rpx(24),
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-around',
    },
    horizontalWrapper: {
        marginBottom: 0,
    },
    quality: {
        width: rpx(52),
        height: rpx(52),
    },
});
