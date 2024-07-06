import React from 'react';
import {StyleSheet, View} from 'react-native';
import rpx from '@/utils/rpx';
import MusicSheet from '@/core/musicSheet';
import ListItem from '@/components/base/listItem';
import ThemeText from '@/components/base/themeText';
import Download from '@/core/download';
import {ImgAsset} from '@/constants/assetsConst';
import Clipboard from '@react-native-clipboard/clipboard';

import MediaMeta from '@/core/mediaExtra';
import {getMediaKey} from '@/utils/mediaItem';
import FastImage from '@/components/base/fastImage';
import Toast from '@/utils/toast';
import LocalMusicSheet from '@/core/localMusicSheet';
import {localMusicSheetId, musicHistorySheetId} from '@/constants/commonConst';
import {ROUTE_PATH} from '@/entry/router';

import {useSafeAreaInsets} from 'react-native-safe-area-context';
import PanelBase from '../base/panelBase';
import {FlatList} from 'react-native-gesture-handler';
import musicHistory from '@/core/musicHistory';
import {showDialog} from '@/components/dialogs/useDialog';
import {hidePanel, showPanel} from '../usePanel';
import Divider from '@/components/base/divider';
import {iconSizeConst} from '@/constants/uiConst';
import Config from '@/core/config';
import TrackPlayer from '@/core/trackPlayer';
import mediaCache from '@/core/mediaCache';
import LyricManager from '@/core/lyricManager';

interface IMusicItemOptionsProps {
    /** 歌曲信息 */
    musicItem: IMusic.IMusicItem;
    /** 歌曲所在歌单 */
    musicSheet?: IMusic.IMusicSheetItem;
    /** 来源 */
    from?: string;
}

const ITEM_HEIGHT = rpx(96);

export default function MusicItemOptions(props: IMusicItemOptionsProps) {
    const {musicItem, musicSheet, from} = props ?? {};

    const safeAreaInsets = useSafeAreaInsets();

    const downloaded = LocalMusicSheet.isLocalMusic(musicItem);
    const associatedLrc = MediaMeta.get(musicItem)?.associatedLrc;

    const options = [
        {
            icon: 'id-card',
            title: `ID: ${getMediaKey(musicItem)}`,
            onPress: () => {
                mediaCache.setMediaCache(musicItem);
                Clipboard.setString(
                    JSON.stringify(
                        {
                            platform: musicItem.platform,
                            id: musicItem.id,
                        },
                        null,
                        '',
                    ),
                );
                Toast.success('已复制到剪切板');
            },
        },
        {
            icon: 'account-music-outline',
            title: `作者: ${musicItem.artist}`,
            onPress: () => {
                Clipboard.setString(musicItem.artist);
                Toast.success('已复制到剪切板');
            },
        },
        {
            icon: 'album',
            show: !!musicItem.album,
            title: `专辑: ${musicItem.album}`,
            onPress: () => {
                Clipboard.setString(musicItem.album);
                Toast.success('已复制到剪切板');
            },
        },
        {
            icon: 'motion-play-outline',
            title: '下一首播放',
            onPress: () => {
                TrackPlayer.addNext(musicItem);
                hidePanel();
            },
        },
        {
            icon: 'plus-box-multiple-outline',
            title: '添加到歌单',
            onPress: () => {
                showPanel('AddToMusicSheet', {musicItem});
            },
        },
        {
            icon: 'download',
            title: '下载',
            show: !downloaded,
            onPress: async () => {
                showPanel('MusicQuality', {
                    musicItem,
                    async onQualityPress(quality) {
                        Download.downloadMusic(musicItem, quality);
                    },
                });
            },
        },
        {
            icon: 'check-circle-outline',
            title: '已下载',
            show: !!downloaded,
        },
        {
            icon: 'trash-can-outline',
            title: '删除',
            show: !!musicSheet,
            onPress: async () => {
                if (musicSheet?.id === localMusicSheetId) {
                    await LocalMusicSheet.removeMusic(musicItem);
                } else if (musicSheet?.id === musicHistorySheetId) {
                    await musicHistory.removeMusic(musicItem);
                } else {
                    await MusicSheet.removeMusic(musicSheet!.id, musicItem);
                }
                Toast.success('已删除');
                hidePanel();
            },
        },
        {
            icon: 'delete-forever-outline',
            title: '删除本地下载',
            show: !!downloaded,
            onPress: () => {
                showDialog('SimpleDialog', {
                    title: '删除本地下载',
                    content: '将会删除已下载的本地文件，确定继续吗？',
                    async onOk() {
                        try {
                            await LocalMusicSheet.removeMusic(musicItem, true);
                            Toast.success('已删除本地下载');
                        } catch (e: any) {
                            Toast.warn(`删除失败 ${e?.message ?? e}`);
                        }
                    },
                });
                hidePanel();
            },
        },
        {
            icon: 'link-variant',
            title: associatedLrc
                ? `已关联歌词 ${associatedLrc.platform}@${associatedLrc.id}`
                : '关联歌词',
            onPress: async () => {
                if (
                    Config.get('setting.basic.associateLyricType') === 'input'
                ) {
                    showPanel('AssociateLrc', {
                        musicItem,
                    });
                } else {
                    showPanel('SearchLrc', {
                        musicItem,
                    });
                }
            },
        },
        {
            icon: 'link-variant-remove',
            title: '解除关联歌词',
            show: !!associatedLrc,
            onPress: async () => {
                MediaMeta.update(musicItem, {
                    associatedLrc: undefined,
                });
                LyricManager.refreshLyric(false, true);
                Toast.success('已解除关联歌词');
                hidePanel();
            },
        },
        {
            icon: 'timer-outline',
            title: '定时关闭',
            show: from === ROUTE_PATH.MUSIC_DETAIL,
            onPress: () => {
                showPanel('TimingClose');
            },
        },
        {
            icon: 'file-remove-outline',
            title: '清除插件缓存(播放异常时使用)',
            onPress: () => {
                mediaCache.removeMediaCache(musicItem);
                Toast.success('缓存已清除');
            },
        },
    ];

    return (
        <PanelBase
            renderBody={() => (
                <>
                    <View style={style.header}>
                        <FastImage
                            style={style.artwork}
                            uri={musicItem?.artwork}
                            emptySrc={ImgAsset.albumDefault}
                        />
                        <View style={style.content}>
                            <ThemeText
                                numberOfLines={2}
                                style={style.title}
                                onPress={() => {
                                    Clipboard.setString(musicItem.title);
                                    Toast.success('已复制到剪切板');
                                }}>
                                {musicItem?.title}
                            </ThemeText>
                            <ThemeText
                                fontColor="textSecondary"
                                fontSize="description">
                                {musicItem?.artist}{' '}
                                {musicItem?.album ? `- ${musicItem.album}` : ''}
                            </ThemeText>
                        </View>
                    </View>
                    <Divider />
                    <View style={style.wrapper}>
                        <FlatList
                            data={options}
                            getItemLayout={(_, index) => ({
                                length: ITEM_HEIGHT,
                                offset: ITEM_HEIGHT * index,
                                index,
                            })}
                            ListFooterComponent={<View style={style.footer} />}
                            style={[
                                style.listWrapper,
                                {
                                    marginBottom: safeAreaInsets.bottom,
                                },
                            ]}
                            keyExtractor={_ => _.title}
                            renderItem={({item}) =>
                                item.show !== false ? (
                                    <ListItem
                                        withHorizonalPadding
                                        heightType="small"
                                        onPress={item.onPress}>
                                        <ListItem.ListItemIcon
                                            width={rpx(48)}
                                            icon={item.icon}
                                            iconSize={iconSizeConst.small}
                                        />
                                        <ListItem.Content title={item.title} />
                                    </ListItem>
                                ) : null
                            }
                        />
                    </View>
                </>
            )}
        />
    );
}

const style = StyleSheet.create({
    wrapper: {
        width: rpx(750),
        flex: 1,
    },
    header: {
        width: rpx(750),
        height: rpx(200),
        flexDirection: 'row',
        padding: rpx(24),
    },
    listWrapper: {
        paddingTop: rpx(12),
    },
    artwork: {
        width: rpx(140),
        height: rpx(140),
        borderRadius: rpx(16),
    },
    content: {
        marginLeft: rpx(36),
        width: rpx(526),
        height: rpx(140),
        justifyContent: 'space-around',
    },
    title: {
        paddingRight: rpx(24),
    },
    footer: {
        width: rpx(750),
        height: rpx(30),
    },
});
