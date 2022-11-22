import React, {useRef} from 'react';
import {StyleSheet, View} from 'react-native';
import rpx from '@/utils/rpx';
import BottomSheet, {
    BottomSheetBackdrop,
    BottomSheetFlatList,
} from '@gorhom/bottom-sheet';
import {Divider} from 'react-native-paper';
import MusicQueue from '@/core/musicQueue';
import MusicSheet from '@/core/musicSheet';
import ListItem from '@/components/base/listItem';
import ThemeText from '@/components/base/themeText';
import usePrimaryColor from '@/hooks/usePrimaryColor';
import Download from '@/core/download';
import {ImgAsset} from '@/constants/assetsConst';
import {BottomSheetMethods} from '@gorhom/bottom-sheet/lib/typescript/types';
import Clipboard from '@react-native-clipboard/clipboard';

import MediaMeta from '@/core/mediaMeta';
import {getMediaKey} from '@/utils/mediaItem';
import Cache from '@/core/cache';
import FastImage from '@/components/base/fastImage';
import Toast from '@/utils/toast';
import LocalMusicSheet from '@/core/localMusicSheet';
import {localMusicSheetId} from '@/constants/commonConst';
import {ROUTE_PATH} from '@/entry/router';
import usePanel from '../usePanel';

interface IMusicItemOptionsProps {
    /** 歌曲信息 */
    musicItem: IMusic.IMusicItem;
    /** 歌曲所在歌单 */
    musicSheet?: IMusic.IMusicSheetItem;
    /** 来源 */
    from?: string;
}

const ITEM_HEIGHT = rpx(96);
// todo: rerender有点多
export default function MusicItemOptions(props: IMusicItemOptionsProps) {
    const sheetRef = useRef<BottomSheetMethods | null>();
    const {showPanel, unmountPanel} = usePanel();
    const primaryColor = usePrimaryColor();

    const {musicItem, musicSheet, from} = props ?? {};

    const downloaded = LocalMusicSheet.isLocalMusic(musicItem);
    function closePanel() {
        sheetRef.current?.close();
    }
    // 关联歌词
    const associatedLrc = MediaMeta.get(musicItem)?.associatedLrc;
    // todo: padding bottom
    const options = [
        {
            icon: 'id-card',
            title: `ID: ${getMediaKey(musicItem)}`,
            onPress: () => {
                Cache.update(musicItem, []);
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
                MusicQueue.addNext(musicItem);
                closePanel();
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
                Download.downloadMusic(musicItem);
                closePanel();
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
                } else {
                    await MusicSheet.removeMusic(musicSheet!.id, musicItem);
                }
                Toast.success('已删除');
                closePanel();
            },
        },
        {
            icon: 'delete-forever-outline',
            title: '删除本地下载',
            show: !!downloaded,
            onPress: async () => {
                await LocalMusicSheet.removeMusic(musicItem, true);
                Toast.success('已删除本地下载');
                closePanel();
            },
        },
        {
            icon: 'link-variant',
            title: associatedLrc
                ? `已关联歌词 ${associatedLrc.platform}@${associatedLrc.id}`
                : '关联歌词',
            onPress: async () => {
                showPanel('AssociateLrc', {
                    musicItem,
                });
            },
        },
        {
            icon: 'link-variant-remove',
            title: '解除关联歌词',
            show: !!associatedLrc,
            onPress: () => {
                MediaMeta.update(musicItem, {
                    associatedLrc: undefined,
                });
                Toast.success('已解除关联歌词');
                closePanel();
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
                Cache.remove(musicItem);
                Toast.success('缓存已清除');
            },
        },
    ];

    return (
        <BottomSheet
            ref={_ => (sheetRef.current = _)}
            backdropComponent={props => {
                return (
                    <BottomSheetBackdrop
                        disappearsOnIndex={-1}
                        pressBehavior={'close'}
                        opacity={0.5}
                        {...props}
                    />
                );
            }}
            backgroundStyle={{backgroundColor: primaryColor}}
            handleComponent={null}
            index={0}
            snapPoints={['60%']}
            enablePanDownToClose
            enableOverDrag={false}
            onClose={unmountPanel}>
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
                    <ThemeText fontColor="secondary" fontSize="description">
                        {musicItem?.artist} - {musicItem?.album}
                    </ThemeText>
                </View>
            </View>
            <Divider />
            <BottomSheetFlatList
                data={options}
                getItemLayout={(_, index) => ({
                    length: ITEM_HEIGHT,
                    offset: ITEM_HEIGHT * index,
                    index,
                })}
                ListFooterComponent={<View style={style.footer} />}
                style={style.listWrapper}
                keyExtractor={_ => _.title}
                renderItem={({item}) =>
                    item.show !== false ? (
                        <ListItem
                            left={{
                                icon: {
                                    name: item.icon,
                                    size: 'small',
                                    fontColor: 'normal',
                                },
                                width: rpx(48),
                            }}
                            itemPaddingHorizontal={0}
                            itemHeight={ITEM_HEIGHT}
                            title={item.title}
                            onPress={item.onPress}
                        />
                    ) : (
                        <></>
                    )
                }
            />
        </BottomSheet>
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
        paddingHorizontal: rpx(24),
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
