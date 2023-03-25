import React, {useCallback, useEffect, useState} from 'react';
import {SectionList, StyleSheet, View} from 'react-native';
import rpx from '@/utils/rpx';
import Config, {IConfigPaths} from '@/core/config';
import ListItem from '@/components/base/listItem';
import ThemeText from '@/components/base/themeText';
import useDialog from '@/components/dialogs/useDialog';
import ThemeSwitch from '@/components/base/switch';
import {clearCache, getCacheSize, sizeFormatter} from '@/utils/fileUtils';
import usePanel from '@/components/panels/usePanel';
import Toast from '@/utils/toast';
import pathConst from '@/constants/pathConst';
import {ROUTE_PATH, useNavigate} from '@/entry/router';
import {readdir} from 'react-native-fs';
import {qualityKeys, qualityText} from '@/utils/qualities';
import {clearLog, getErrorLogContent} from '@/utils/log';
import {ScrollView} from 'react-native-gesture-handler';
import {Paragraph} from 'react-native-paper';

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

    const createRadio = useCallback(function (
        title: string,
        changeKey: IConfigPaths,
        candidates: Array<string | number>,
        value: string | number,
        valueMap?: Record<string | number, string | number>,
    ) {
        const onPress = () => {
            showDialog('RadioDialog', {
                title,
                content: valueMap
                    ? candidates.map(_ => ({
                          key: valueMap[_],
                          value: _,
                      }))
                    : candidates,
                onOk(val) {
                    Config.set(changeKey, val);
                },
            });
        };
        return {
            title,
            right: () => (
                <ThemeText style={style.centerText}>
                    {valueMap ? valueMap[value] : value}
                </ThemeText>
            ),
            onPress,
        };
    },
    []);

    useEffect(() => {
        refreshCacheSize();
    }, []);

    const basicOptions = [
        {
            title: '播放',
            data: [
                createSwitch(
                    '允许与其他应用同时播放',
                    'setting.basic.notInterrupt',
                    basicSetting?.notInterrupt ?? false,
                ),
                createRadio(
                    '播放被暂时打断时',
                    'setting.basic.tempRemoteDuck',
                    ['暂停', '降低音量'],
                    basicSetting?.tempRemoteDuck ?? '暂停',
                ),
                createSwitch(
                    '播放失败时自动暂停',
                    'setting.basic.autoStopWhenError',
                    basicSetting?.autoStopWhenError ?? false,
                ),
                createRadio(
                    '点击搜索结果内单曲时',
                    'setting.basic.clickMusicInSearch',
                    ['播放歌曲', '播放歌曲并替换播放列表'],
                    basicSetting?.clickMusicInSearch ?? '播放歌曲',
                ),
                createRadio(
                    '点击专辑内单曲时',
                    'setting.basic.clickMusicInAlbum',
                    ['播放单曲', '播放专辑'],
                    basicSetting?.clickMusicInAlbum ?? '播放专辑',
                ),
                createRadio(
                    '默认播放音质',
                    'setting.basic.defaultPlayQuality',
                    qualityKeys,
                    basicSetting?.defaultPlayQuality ?? 'standard',
                    qualityText,
                ),
                createRadio(
                    '默认播放音质缺失时',
                    'setting.basic.playQualityOrder',
                    ['asc', 'desc'],
                    basicSetting?.playQualityOrder ?? 'asc',
                    {
                        asc: '播放更高音质',
                        desc: '播放更低音质',
                    },
                ),
            ],
        },
        {
            title: '下载',
            data: [
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
                createRadio(
                    '最大同时下载数目',
                    'setting.basic.maxDownload',
                    [1, 3, 5, 7],
                    basicSetting?.maxDownload ?? 3,
                ),
                createRadio(
                    '默认下载音质',
                    'setting.basic.defaultDownloadQuality',
                    qualityKeys,
                    basicSetting?.defaultDownloadQuality ?? 'standard',
                    qualityText,
                ),
                createRadio(
                    '默认下载音质缺失时',
                    'setting.basic.downloadQualityOrder',
                    ['asc', 'desc'],
                    basicSetting?.downloadQualityOrder ?? 'asc',
                    {
                        asc: '下载更高音质',
                        desc: '下载更低音质',
                    },
                ),
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
            title: '开发选项',
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
                createSwitch(
                    '调试面板',
                    'setting.basic.debug.devLog',
                    basicSetting?.debug?.devLog ?? false,
                ),
                {
                    title: '查看错误日志',
                    right: undefined,
                    async onPress() {
                        // 获取日志文件夹
                        const errorLogContent = await getErrorLogContent();
                        showDialog('SimpleDialog', {
                            title: '错误日志',
                            content: (
                                <ScrollView>
                                    <Paragraph>
                                        {errorLogContent || '暂无记录'}
                                    </Paragraph>
                                </ScrollView>
                            ),
                        });
                    },
                },
                {
                    title: '清空日志',
                    right: undefined,
                    async onPress() {
                        try {
                            await clearLog();
                            Toast.success('日志已清空');
                        } catch {}
                    },
                },
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
        width: '100%',
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
