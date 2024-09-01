import React from 'react';
import {StyleSheet, View} from 'react-native';
import rpx from '@/utils/rpx';
import ListItem from '@/components/base/listItem';
import ThemeText from '@/components/base/themeText';
import {ImgAsset} from '@/constants/assetsConst';
import Clipboard from '@react-native-clipboard/clipboard';
import {getMediaKey} from '@/utils/mediaItem';
import FastImage from '@/components/base/fastImage';
import Toast from '@/utils/toast';
import toast from '@/utils/toast';

import {useSafeAreaInsets} from 'react-native-safe-area-context';
import PanelBase from '../base/panelBase';
import {FlatList} from 'react-native-gesture-handler';
import Divider from '@/components/base/divider';
import {iconSizeConst} from '@/constants/uiConst';
import Config from '@/core/config';
import mediaCache from '@/core/mediaCache';
import LyricManager from '@/core/lyricManager';
import {IIconName} from '@/components/base/icon.tsx';
import LyricUtil from '@/native/lyricUtil';
import {hidePanel} from '@/components/panels/usePanel.ts';
import {getDocumentAsync} from 'expo-document-picker';
import {readAsStringAsync} from 'expo-file-system';
import {checkAndCreateDir} from '@/utils/fileUtils.ts';
import pathConst from '@/constants/pathConst.ts';
import CryptoJs from 'crypto-js';
import RNFS from 'react-native-fs';

interface IMusicItemLyricOptionsProps {
    /** 歌曲信息 */
    musicItem: IMusic.IMusicItem;
}

const ITEM_HEIGHT = rpx(96);

interface IOption {
    icon: IIconName;
    title: string;
    onPress?: () => void;
    show?: boolean;
}

export default function MusicItemLyricOptions(
    props: IMusicItemLyricOptionsProps,
) {
    const {musicItem} = props ?? {};

    const platformHash = CryptoJs.MD5(musicItem.platform).toString(
        CryptoJs.enc.Hex,
    );
    const idHash: string = CryptoJs.MD5(musicItem.id).toString(
        CryptoJs.enc.Hex,
    );

    const safeAreaInsets = useSafeAreaInsets();

    const options: IOption[] = [
        {
            icon: 'identification',
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
            icon: 'user',
            title: `作者: ${musicItem.artist}`,
            onPress: () => {
                try {
                    Clipboard.setString(musicItem.artist.toString());
                    Toast.success('已复制到剪切板');
                } catch {
                    Toast.warn('复制失败');
                }
            },
        },
        {
            icon: 'album-outline',
            show: !!musicItem.album,
            title: `专辑: ${musicItem.album}`,
            onPress: () => {
                try {
                    Clipboard.setString(musicItem.album.toString());
                    Toast.success('已复制到剪切板');
                } catch {
                    Toast.warn('复制失败');
                }
            },
        },
        {
            icon: 'lyric',
            title: `${
                Config.get('setting.lyric.showStatusBarLyric') ? '关闭' : '开启'
            }桌面歌词`,
            async onPress() {
                const lyricConfig = Config.get('setting.lyric');
                if (!lyricConfig?.showStatusBarLyric) {
                    const hasPermission =
                        await LyricUtil.checkSystemAlertPermission();

                    if (hasPermission) {
                        LyricUtil.showStatusBarLyric(
                            LyricManager.getCurrentLyric()?.lrc ?? 'MusicFree',
                            Config.get('setting.lyric') ?? {},
                        );
                        Config.set('setting.lyric.showStatusBarLyric', true);
                    } else {
                        LyricUtil.requestSystemAlertPermission().finally(() => {
                            Toast.warn('开启桌面歌词失败，无悬浮窗权限');
                        });
                    }
                } else {
                    LyricUtil.hideStatusBarLyric();
                    Config.set('setting.lyric.showStatusBarLyric', false);
                }
                hidePanel();
            },
        },
        {
            icon: 'arrow-up-tray',
            title: '上传本地歌词',
            async onPress() {
                try {
                    const result = await getDocumentAsync({
                        copyToCacheDirectory: true,
                    });
                    if (result.canceled) {
                        return;
                    }
                    const pickedDoc = result.assets[0].uri;
                    const lyricContent = await readAsStringAsync(pickedDoc, {
                        encoding: 'utf8',
                    });

                    // 调用rnfs写到external storage
                    await checkAndCreateDir(
                        pathConst.localLrcPath + platformHash,
                    );

                    await RNFS.writeFile(
                        pathConst.localLrcPath +
                            platformHash +
                            '/' +
                            idHash +
                            '.lrc',
                        lyricContent,
                        'utf8',
                    );
                    toast.success('设置成功');
                    LyricManager.refreshLyric(false, true);
                    hidePanel();
                } catch (e: any) {
                    console.log(e);
                    toast.warn('设置失败' + e.message);
                }
            },
        },
        {
            icon: 'arrow-up-tray',
            title: '上传本地歌词翻译',
            async onPress() {
                try {
                    const result = await getDocumentAsync({
                        copyToCacheDirectory: true,
                    });
                    if (result.canceled) {
                        return;
                    }
                    const pickedDoc = result.assets[0].uri;
                    const lyricContent = await readAsStringAsync(pickedDoc, {
                        encoding: 'utf8',
                    });

                    // 调用rnfs写到external storage
                    await checkAndCreateDir(
                        pathConst.localLrcPath + platformHash,
                    );

                    await RNFS.writeFile(
                        pathConst.localLrcPath +
                            platformHash +
                            '/' +
                            idHash +
                            '.tran.lrc',
                        lyricContent,
                        'utf8',
                    );
                    toast.success('设置成功');
                    LyricManager.refreshLyric(false, true);
                    hidePanel();
                } catch (e: any) {
                    console.log(e);
                    toast.warn('设置失败' + e.message);
                }
            },
        },
        {
            icon: 'trash-outline',
            title: '删除本地歌词',
            async onPress() {
                try {
                    const basePath =
                        pathConst.localLrcPath + platformHash + '/' + idHash;

                    await RNFS.unlink(basePath + '.lrc').catch(() => {});
                    await RNFS.unlink(basePath + '.tran.lrc').catch(() => {});

                    toast.success('删除成功');
                    LyricManager.refreshLyric(false, true);
                    hidePanel();
                } catch (e: any) {
                    console.log(e);
                    toast.warn('删除失败' + e.message);
                }
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
                            <ThemeText numberOfLines={2} style={style.title}>
                                {musicItem?.title}
                            </ThemeText>
                            <ThemeText
                                fontColor="textSecondary"
                                fontSize="description"
                                numberOfLines={2}>
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
                                        withHorizontalPadding
                                        heightType="small"
                                        onPress={item.onPress}>
                                        <ListItem.ListItemIcon
                                            width={rpx(48)}
                                            icon={item.icon}
                                            iconSize={iconSizeConst.light}
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
