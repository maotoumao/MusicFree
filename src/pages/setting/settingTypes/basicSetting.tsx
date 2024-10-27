import React, {useCallback, useEffect, useRef, useState} from 'react';
import {SectionList, StyleSheet, TouchableOpacity, View} from 'react-native';
import rpx from '@/utils/rpx';
import Config, {IConfigPaths} from '@/core/config';
import ListItem from '@/components/base/listItem';
import ThemeText from '@/components/base/themeText';
import ThemeSwitch from '@/components/base/switch';
import {clearCache, getCacheSize, sizeFormatter} from '@/utils/fileUtils';

import Toast from '@/utils/toast';
import pathConst from '@/constants/pathConst';
import {ROUTE_PATH, useNavigate} from '@/entry/router';
import {readdir} from 'react-native-fs';
import {qualityKeys, qualityText} from '@/utils/qualities';
import {clearLog, getErrorLogContent} from '@/utils/log';
import {FlatList, ScrollView} from 'react-native-gesture-handler';
import {showDialog} from '@/components/dialogs/useDialog';
import {showPanel} from '@/components/panels/usePanel';
import Paragraph from '@/components/base/paragraph';
import LyricUtil, {NativeTextAlignment} from '@/native/lyricUtil';
import Slider from '@react-native-community/slider';
import useColors from '@/hooks/useColors';
import ColorBlock from '@/components/base/colorBlock';
import LyricManager from '@/core/lyricManager';
import {SortType} from '@/constants/commonConst.ts';
import Clipboard from '@react-native-clipboard/clipboard';
import toast from '@/utils/toast';

function createSwitch(
    title: string,
    changeKey: IConfigPaths,
    value: boolean,
    callback?: (newValue: boolean) => void,
) {
    const onPress = () => {
        if (callback) {
            callback(!value);
        } else {
            Config.set(changeKey, !value);
        }
    };
    return {
        title,
        onPress,
        right: <ThemeSwitch value={value} onValueChange={onPress} />,
    };
}

const createRadio = function (
    title: string,
    changeKey: IConfigPaths,
    candidates: Array<string | number>,
    value: string | number,
    valueMap?: Record<string | number, string | number>,
    onChange?: (value: string | number) => void,
) {
    const onPress = () => {
        showDialog('RadioDialog', {
            title,
            content: valueMap
                ? candidates.map(_ => ({
                      label: valueMap[_] as string,
                      value: _,
                  }))
                : candidates,
            onOk(val) {
                Config.set(changeKey, val);
                onChange?.(val);
            },
        });
    };
    return {
        title,
        right: (
            <ThemeText style={styles.centerText}>
                {valueMap ? valueMap[value] : value}
            </ThemeText>
        ),
        onPress,
    };
};

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

    const navigate = useNavigate();

    const [cacheSize, refreshCacheSize] = useCacheSize();

    const sectionListRef = useRef<SectionList | null>(null);
    // const titleListRef = useRef<FlatList | null>(null);

    useEffect(() => {
        refreshCacheSize();
    }, []);

    const basicOptions = [
        {
            title: '常规',
            data: [
                createRadio(
                    '历史记录最多保存条数',
                    'setting.basic.maxHistoryLen',
                    [20, 50, 100, 200, 500],
                    basicSetting?.maxHistoryLen ?? 50,
                ),
                createRadio(
                    '打开歌曲详情页时',
                    'setting.basic.musicDetailDefault',
                    ['album', 'lyric'],
                    basicSetting?.musicDetailDefault ?? 'album',
                    {
                        album: '默认展示歌曲封面',
                        lyric: '默认展示歌词页',
                    },
                ),
                createSwitch(
                    '处于歌曲详情页时常亮',
                    'setting.basic.musicDetailAwake',
                    basicSetting?.musicDetailAwake ?? false,
                ),
                createRadio(
                    '关联歌词方式',
                    'setting.basic.associateLyricType',
                    ['input', 'search'],
                    basicSetting?.associateLyricType ?? 'search',
                    {
                        input: '输入歌曲ID',
                        search: '搜索歌词',
                    },
                ),
                createSwitch(
                    '通知栏显示关闭按钮 (重启后生效)',
                    'setting.basic.showExitOnNotification',
                    basicSetting?.showExitOnNotification ?? false,
                ),
            ],
        },
        {
            title: '歌单&专辑',
            data: [
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
                    '打开歌曲详情页时',
                    'setting.basic.musicDetailDefault',
                    ['album', 'lyric'],
                    basicSetting?.musicDetailDefault ?? 'album',
                    {
                        album: '默认展示歌曲封面',
                        lyric: '默认展示歌词页',
                    },
                ),
                createRadio(
                    '新建歌单时默认歌曲排序',
                    'setting.basic.musicOrderInLocalSheet',
                    [
                        SortType.Title,
                        SortType.Artist,
                        SortType.Album,
                        SortType.Newest,
                        SortType.Oldest,
                    ],
                    basicSetting?.musicOrderInLocalSheet ?? 'end',
                    {
                        [SortType.Title]: '按歌曲名排序',
                        [SortType.Artist]: '按作者名排序',
                        [SortType.Album]: '按专辑名排序',
                        [SortType.Newest]: '按收藏时间从新到旧排序',
                        [SortType.Oldest]: '按收藏时间从旧到新排序',
                    },
                ),
            ],
        },
        {
            title: '插件',
            data: [
                createSwitch(
                    '软件启动时自动更新插件',
                    'setting.basic.autoUpdatePlugin',
                    basicSetting?.autoUpdatePlugin ?? false,
                ),
                createSwitch(
                    '安装插件时不校验版本',
                    'setting.basic.notCheckPluginVersion',
                    basicSetting?.notCheckPluginVersion ?? false,
                ),
            ],
        },
        {
            title: '播放',
            data: [
                createSwitch(
                    '允许与其他应用同时播放',
                    'setting.basic.notInterrupt',
                    basicSetting?.notInterrupt ?? false,
                ),
                createSwitch(
                    '软件启动时自动播放歌曲',
                    'setting.basic.autoPlayWhenAppStart',
                    basicSetting?.autoPlayWhenAppStart ?? false,
                ),
                createSwitch(
                    '播放失败时尝试更换音源',
                    'setting.basic.tryChangeSourceWhenPlayFail',
                    basicSetting?.tryChangeSourceWhenPlayFail ?? false,
                ),
                createSwitch(
                    '播放失败时自动暂停',
                    'setting.basic.autoStopWhenError',
                    basicSetting?.autoStopWhenError ?? false,
                ),
                createRadio(
                    '播放被暂时打断时',
                    'setting.basic.tempRemoteDuck',
                    ['暂停', '降低音量'],
                    basicSetting?.tempRemoteDuck ?? '暂停',
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
                    right: (
                        <ThemeText
                            fontSize="subTitle"
                            style={styles.centerText}
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
            title: '歌词',
            data: [],
            footer: <LyricSetting />,
        },
        {
            title: '缓存',
            data: [
                {
                    title: '音乐缓存上限',
                    right: (
                        <ThemeText style={styles.centerText}>
                            {basicSetting?.maxCacheSize
                                ? sizeFormatter(basicSetting.maxCacheSize)
                                : '512M'}
                        </ThemeText>
                    ),
                    onPress() {
                        showPanel('SimpleInput', {
                            title: '设置缓存',
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
                    right: (
                        <ThemeText style={styles.centerText}>
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
                    right: (
                        <ThemeText style={styles.centerText}>
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
                    right: (
                        <ThemeText style={styles.centerText}>
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
                            cancelText: '我知道了',
                            okText: '复制日志',
                            onOk() {
                                if (errorLogContent) {
                                    Clipboard.setString(errorLogContent);
                                    toast.success('复制成功');
                                }
                            },
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
        <View style={styles.wrapper}>
            <FlatList
                style={styles.headerContainer}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.headerContentContainer}
                horizontal
                data={basicOptions.map(it => it.title)}
                renderItem={({item, index}) => (
                    <TouchableOpacity
                        onPress={() => {
                            sectionListRef.current?.scrollToLocation({
                                sectionIndex: index,
                                itemIndex: 0,
                            });
                        }}
                        activeOpacity={0.7}
                        style={styles.headerItemStyle}>
                        <ThemeText fontWeight="bold">{item}</ThemeText>
                    </TouchableOpacity>
                )}
            />
            <SectionList
                sections={basicOptions}
                renderSectionHeader={({section}) => (
                    <View style={styles.sectionHeader}>
                        <ThemeText
                            fontSize="subTitle"
                            fontColor="textSecondary"
                            fontWeight="bold">
                            {section.title}
                        </ThemeText>
                    </View>
                )}
                ref={sectionListRef}
                renderSectionFooter={({section}) => {
                    return section.footer ?? null;
                }}
                renderItem={({item}) => {
                    const Right = item.right;

                    return (
                        <ListItem
                            withHorizontalPadding
                            heightType="small"
                            onPress={item.onPress}>
                            <ListItem.Content title={item.title} />
                            {Right}
                        </ListItem>
                    );
                }}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    wrapper: {
        width: '100%',
        paddingBottom: rpx(24),
        flex: 1,
    },
    centerText: {
        textAlignVertical: 'center',
        maxWidth: rpx(400),
    },
    sectionHeader: {
        paddingHorizontal: rpx(24),
        height: rpx(72),
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: rpx(20),
    },
    headerContainer: {
        height: rpx(80),
    },
    headerContentContainer: {
        height: rpx(80),
        alignItems: 'center',
        paddingHorizontal: rpx(24),
    },
    headerItemStyle: {
        paddingHorizontal: rpx(36),
        height: rpx(80),
        justifyContent: 'center',
        alignItems: 'center',
    },
});

function LyricSetting() {
    const lyricSetting = Config.useConfig('setting.lyric');

    const colors = useColors();

    const autoSearchLyric = createSwitch(
        '歌词缺失时自动搜索歌词',
        'setting.lyric.autoSearchLyric',
        lyricSetting?.autoSearchLyric ?? false,
    );

    const openStatusBarLyric = createSwitch(
        '开启桌面歌词',
        'setting.lyric.showStatusBarLyric',
        lyricSetting?.showStatusBarLyric ?? false,
        async newValue => {
            try {
                if (newValue) {
                    const hasPermission =
                        await LyricUtil.checkSystemAlertPermission();

                    if (hasPermission) {
                        LyricUtil.showStatusBarLyric(
                            LyricManager.getCurrentLyric()?.lrc ?? 'MusicFree',
                            lyricSetting ?? {},
                        );
                        Config.set('setting.lyric.showStatusBarLyric', true);
                    } else {
                        LyricUtil.requestSystemAlertPermission().finally(() => {
                            Toast.warn('无悬浮窗权限');
                        });
                    }
                } else {
                    LyricUtil.hideStatusBarLyric();
                    Config.set('setting.lyric.showStatusBarLyric', false);
                }
            } catch {}
        },
    );

    const alignStatusBarLyric = createRadio(
        '对齐方式',
        'setting.lyric.align',
        [
            NativeTextAlignment.LEFT,
            NativeTextAlignment.CENTER,
            NativeTextAlignment.RIGHT,
        ],
        lyricSetting?.align ?? NativeTextAlignment.CENTER,
        {
            [NativeTextAlignment.LEFT]: '左对齐',
            [NativeTextAlignment.CENTER]: '居中对齐',
            [NativeTextAlignment.RIGHT]: '右对齐',
        },
        newVal => {
            if (lyricSetting?.showStatusBarLyric) {
                LyricUtil.setStatusBarLyricAlign(newVal as any);
            }
        },
    );

    return (
        <View>
            <ListItem
                withHorizontalPadding
                heightType="small"
                onPress={autoSearchLyric.onPress}>
                <ListItem.Content title={autoSearchLyric.title} />
                {autoSearchLyric.right}
            </ListItem>
            <ListItem
                withHorizontalPadding
                heightType="small"
                onPress={openStatusBarLyric.onPress}>
                <ListItem.Content title={openStatusBarLyric.title} />
                {openStatusBarLyric.right}
            </ListItem>
            <View style={lyricStyles.sliderContainer}>
                <ThemeText>左右距离</ThemeText>
                <Slider
                    style={lyricStyles.slider}
                    minimumTrackTintColor={colors.primary}
                    maximumTrackTintColor={colors.text ?? '#999999'}
                    thumbTintColor={colors.primary}
                    minimumValue={0}
                    step={0.01}
                    value={lyricSetting?.leftPercent ?? 0.5}
                    maximumValue={1}
                    onValueChange={val => {
                        if (lyricSetting?.showStatusBarLyric) {
                            LyricUtil.setStatusBarLyricLeft(val);
                        }
                    }}
                    onSlidingComplete={val => {
                        Config.set('setting.lyric.leftPercent', val);
                    }}
                />
            </View>
            <View style={lyricStyles.sliderContainer}>
                <ThemeText>上下距离</ThemeText>
                <Slider
                    style={lyricStyles.slider}
                    minimumTrackTintColor={colors.primary}
                    maximumTrackTintColor={colors.text ?? '#999999'}
                    thumbTintColor={colors.primary}
                    minimumValue={0}
                    value={lyricSetting?.topPercent ?? 0}
                    step={0.01}
                    maximumValue={1}
                    onValueChange={val => {
                        if (lyricSetting?.showStatusBarLyric) {
                            LyricUtil.setStatusBarLyricTop(val);
                        }
                    }}
                    onSlidingComplete={val => {
                        Config.set('setting.lyric.topPercent', val);
                    }}
                />
            </View>
            <View style={lyricStyles.sliderContainer}>
                <ThemeText>歌词宽度</ThemeText>
                <Slider
                    style={lyricStyles.slider}
                    minimumTrackTintColor={colors.primary}
                    maximumTrackTintColor={colors.text ?? '#999999'}
                    thumbTintColor={colors.primary}
                    minimumValue={0}
                    step={0.01}
                    value={lyricSetting?.widthPercent ?? 0.5}
                    maximumValue={1}
                    onValueChange={val => {
                        if (lyricSetting?.showStatusBarLyric) {
                            LyricUtil.setStatusBarLyricWidth(val);
                        }
                    }}
                    onSlidingComplete={val => {
                        Config.set('setting.lyric.widthPercent', val);
                    }}
                />
            </View>
            <View style={lyricStyles.sliderContainer}>
                <ThemeText>字体大小</ThemeText>
                <Slider
                    style={lyricStyles.slider}
                    minimumTrackTintColor={colors.primary}
                    maximumTrackTintColor={colors.text ?? '#999999'}
                    thumbTintColor={colors.primary}
                    minimumValue={Math.round(rpx(18))}
                    step={0.5}
                    maximumValue={Math.round(rpx(56))}
                    value={lyricSetting?.fontSize ?? Math.round(rpx(24))}
                    onValueChange={val => {
                        if (lyricSetting?.showStatusBarLyric) {
                            LyricUtil.setStatusBarLyricFontSize(val);
                        }
                    }}
                    onSlidingComplete={val => {
                        Config.set('setting.lyric.fontSize', val);
                    }}
                />
            </View>
            <ListItem
                withHorizontalPadding
                heightType="small"
                onPress={alignStatusBarLyric.onPress}>
                <ListItem.Content title={alignStatusBarLyric.title} />
                {alignStatusBarLyric.right}
            </ListItem>
            <ListItem
                withHorizontalPadding
                heightType="small"
                onPress={() => {
                    showPanel('ColorPicker', {
                        closePanelWhenSelected: true,
                        defaultColor: lyricSetting?.color ?? 'transparent',
                        onSelected(color) {
                            if (lyricSetting?.showStatusBarLyric) {
                                const colorStr = color.hexa();
                                LyricUtil.setStatusBarColors(colorStr, null);
                                Config.set('setting.lyric.color', colorStr);
                            }
                        },
                    });
                }}>
                <ListItem.Content title="文本颜色" />
                <ColorBlock color={lyricSetting?.color ?? '#FFE9D2FF'} />
            </ListItem>
            <ListItem
                withHorizontalPadding
                heightType="small"
                onPress={() => {
                    showPanel('ColorPicker', {
                        closePanelWhenSelected: true,
                        defaultColor:
                            lyricSetting?.backgroundColor ?? 'transparent',
                        onSelected(color) {
                            if (lyricSetting?.showStatusBarLyric) {
                                const colorStr = color.hexa();
                                LyricUtil.setStatusBarColors(null, colorStr);
                                Config.set(
                                    'setting.lyric.backgroundColor',
                                    colorStr,
                                );
                            }
                        },
                    });
                }}>
                <ListItem.Content title="文本背景色" />
                <ColorBlock
                    color={lyricSetting?.backgroundColor ?? '#84888153'}
                />
            </ListItem>
        </View>
    );
}

const lyricStyles = StyleSheet.create({
    slider: {
        flex: 1,
        marginLeft: rpx(24),
    },
    sliderContainer: {
        height: rpx(96),
        width: '100%',
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: rpx(24),
    },
});
