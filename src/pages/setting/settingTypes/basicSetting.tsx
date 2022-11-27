import React, {useCallback, useEffect, useState} from 'react';
import {SectionList, StyleSheet, View} from 'react-native';
import rpx from '@/utils/rpx';
import Config, {IConfigPaths} from '@/core/config';
import ListItem from '@/components/base/listItem';
import ThemeText from '@/components/base/themeText';
import useDialog from '@/components/dialogs/useDialog';
import ThemeSwitch from '@/components/base/swtich';
import {clearCache, getCacheSize, sizeFormatter} from '@/utils/fileUtils';
import usePanel from '@/components/panels/usePanel';
import Toast from '@/utils/toast';
import pathConst from '@/constants/pathConst';
import {ROUTE_PATH, useNavigate} from '@/entry/router';
import {readdir} from 'react-native-fs';

const ITEM_HEIGHT = rpx(96);

function createSwitch(title: string, changeKey: IConfigPaths, value: boolean) {
    const onPress = () => {
        Config.set(changeKey, !value);
    };
    return {
        title,
        onPress,
        right: () => <ThemeSwitch value={value} onValueChange={onPress} />,
    };
}

function useCacheSize() {
    const [cacheSize, setCacheSize] = useState({
        music: 0,
        lyric: 0,
        image: 0,
    });

    const refreshCacheSize = useCallback(async () => {
        const [musicCache, lyricCache, imageCache] = await Promise.all([
            getCacheSize('music'),
            getCacheSize('lyric'),
            getCacheSize('image'),
        ]);
        setCacheSize({
            music: musicCache,
            lyric: lyricCache,
            image: imageCache,
        });
    }, []);

    return [cacheSize, refreshCacheSize] as const;
}

export default function BasicSetting() {
    const basicSetting = Config.useConfig('setting.basic');
    const {showDialog} = useDialog();
    const {showPanel} = usePanel();
    const navigate = useNavigate();

    const [cacheSize, refreshCacheSize] = useCacheSize();

    useEffect(() => {
        refreshCacheSize();
    }, []);

    const basicOptions = [
        {
            title: '播放与下载',
            data: [
                createSwitch(
                    '允许与其他应用同时播放',
                    'setting.basic.notInterrupt',
                    basicSetting?.notInterrupt ?? false,
                ),
                createSwitch(
                    '播放失败时自动暂停',
                    'setting.basic.autoStopWhenError',
                    basicSetting?.autoStopWhenError ?? false,
                ),
                {
                    title: '最大同时下载数目',
                    right: () => (
                        <ThemeText style={style.centerText}>
                            {basicSetting?.maxDownload ?? 3}
                        </ThemeText>
                    ),
                    onPress() {
                        showDialog('RadioDialog', {
                            title: '最大同时下载数目',
                            content: [1, 3, 5, 7],
                            onOk(val) {
                                Config.set('setting.basic.maxDownload', val);
                            },
                        });
                    },
                },
                {
                    title: '点击专辑内单曲时',
                    right: () => (
                        <ThemeText style={style.centerText}>
                            {basicSetting?.clickMusicInAlbum ?? '播放专辑'}
                        </ThemeText>
                    ),
                    onPress() {
                        showDialog('RadioDialog', {
                            title: '点击专辑内单曲时',
                            content: ['播放单曲', '播放专辑'],
                            onOk(val) {
                                Config.set(
                                    'setting.basic.clickMusicInAlbum',
                                    val as any,
                                );
                            },
                        });
                    },
                },
                {
                    title: '下载路径',
                    right: () => (
                        <ThemeText
                            fontSize="subTitle"
                            style={style.centerText}
                            numberOfLines={3}>
                            {basicSetting?.downloadPath ??
                                pathConst.downloadMusicPath}
                        </ThemeText>
                    ),
                    onPress() {
                        navigate<'file-selector'>(ROUTE_PATH.FILE_SELECTOR, {
                            fileType: 'folder',
                            multi: false,
                            actionText: '选择文件夹',
                            async onAction(selectedFiles) {
                                try {
                                    const targetDir = selectedFiles[0];
                                    await readdir(targetDir.path);
                                    Config.set(
                                        'setting.basic.downloadPath',
                                        targetDir.path,
                                    );
                                    return true;
                                } catch {
                                    Toast.warn('文件夹不存在或无权限');
                                    return false;
                                }
                            },
                        });
                    },
                },
            ],
        },
        {
            title: '网络',
            data: [
                createSwitch(
                    '使用移动网络播放',
                    'setting.basic.useCelluarNetworkPlay',
                    basicSetting?.useCelluarNetworkPlay ?? false,
                ),
                createSwitch(
                    '使用移动网络下载',
                    'setting.basic.useCelluarNetworkDownload',
                    basicSetting?.useCelluarNetworkDownload ?? false,
                ),
            ],
        },
        {
            title: '缓存',
            data: [
                {
                    title: '音乐缓存上限',
                    right: () => (
                        <ThemeText style={style.centerText}>
                            {basicSetting?.maxCacheSize
                                ? sizeFormatter(basicSetting.maxCacheSize)
                                : '512M'}
                        </ThemeText>
                    ),
                    onPress() {
                        showPanel('SimpleInput', {
                            placeholder: '输入缓存占用上限，100M-8192M，单位M',
                            onOk(text, closePanel) {
                                let val = parseInt(text);
                                if (val < 100) {
                                    val = 100;
                                } else if (val > 8192) {
                                    val = 8192;
                                }
                                if (val >= 100 && val <= 8192) {
                                    Config.set(
                                        'setting.basic.maxCacheSize',
                                        val * 1024 * 1024,
                                    );
                                    closePanel();
                                    Toast.success('设置成功');
                                }
                            },
                        });
                    },
                },

                {
                    title: '清除音乐缓存',
                    right: () => (
                        <ThemeText style={style.centerText}>
                            {sizeFormatter(cacheSize.music)}
                        </ThemeText>
                    ),
                    onPress() {
                        showDialog('SimpleDialog', {
                            title: '清除音乐缓存',
                            content: '确定清除音乐缓存吗?',
                            async onOk() {
                                await clearCache('music');
                                Toast.success('已清除音乐缓存');
                                refreshCacheSize();
                            },
                        });
                    },
                },
                {
                    title: '清除歌词缓存',
                    right: () => (
                        <ThemeText style={style.centerText}>
                            {sizeFormatter(cacheSize.lyric)}
                        </ThemeText>
                    ),
                    onPress() {
                        showDialog('SimpleDialog', {
                            title: '清除歌词缓存',
                            content: '确定清除歌词缓存吗?',
                            async onOk() {
                                await clearCache('lyric');
                                Toast.success('已清除歌词缓存');
                                refreshCacheSize();
                            },
                        });
                    },
                },
                {
                    title: '清除图片缓存',
                    right: () => (
                        <ThemeText style={style.centerText}>
                            {sizeFormatter(cacheSize.image)}
                        </ThemeText>
                    ),
                    onPress() {
                        showDialog('SimpleDialog', {
                            title: '清除图片缓存',
                            content: '确定清除图片缓存吗?',
                            async onOk() {
                                await clearCache('image');
                                Toast.success('已清除图片缓存');
                                refreshCacheSize();
                            },
                        });
                    },
                },
            ],
        },
        {
            title: '错误日志',
            data: [
                createSwitch(
                    '记录错误日志',
                    'setting.basic.debug.errorLog',
                    basicSetting?.debug?.errorLog ?? false,
                ),
                createSwitch(
                    '记录详细日志',
                    'setting.basic.debug.traceLog',
                    basicSetting?.debug?.traceLog ?? false,
                ),
            ],
        },
    ];

    return (
        <View style={style.wrapper}>
            <SectionList
                sections={basicOptions}
                renderSectionHeader={({section}) => (
                    <View style={style.sectionHeader}>
                        <ThemeText fontSize="subTitle" fontColor="secondary">
                            {section.title}
                        </ThemeText>
                    </View>
                )}
                renderItem={({item}) => (
                    <ListItem
                        itemHeight={ITEM_HEIGHT}
                        title={item.title}
                        right={item.right}
                        onPress={item.onPress}
                    />
                )}
            />
        </View>
    );
}

const style = StyleSheet.create({
    wrapper: {
        width: rpx(750),
        paddingVertical: rpx(24),
        flex: 1,
    },
    centerText: {
        textAlignVertical: 'center',
        maxWidth: rpx(400),
    },
    sectionHeader: {
        paddingHorizontal: rpx(36),
        marginTop: rpx(48),
    },
});
