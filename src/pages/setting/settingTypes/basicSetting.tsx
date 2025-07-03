import ColorBlock from "@/components/base/colorBlock";
import ListItem from "@/components/base/listItem";
import Paragraph from "@/components/base/paragraph";
import ThemeSwitch from "@/components/base/switch";
import ThemeText from "@/components/base/themeText";
import { showDialog } from "@/components/dialogs/useDialog";
import { showPanel } from "@/components/panels/usePanel";
import { SortType } from "@/constants/commonConst.ts";
import pathConst from "@/constants/pathConst";
import Config, { useAppConfig } from "@/core/appConfig";
import { useI18N } from "@/core/i18n";
import { ROUTE_PATH, useNavigate } from "@/core/router";
import useColors from "@/hooks/useColors";
import LyricUtil, { NativeTextAlignment } from "@/native/lyricUtil";
import { AppConfigPropertyKey } from "@/types/core/config";
import { clearCache, getCacheSize, sizeFormatter } from "@/utils/fileUtils";
import { clearLog, getErrorLogContent } from "@/utils/log";
import { qualityKeys } from "@/utils/qualities";
import rpx from "@/utils/rpx";
import Toast from "@/utils/toast";
import Clipboard from "@react-native-clipboard/clipboard";
import Slider from "@react-native-community/slider";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { SectionList, StyleSheet, TouchableOpacity, View } from "react-native";
import { readdir } from "react-native-fs";
import { FlatList, ScrollView } from "react-native-gesture-handler";

function createSwitch(
    title: string,
    changeKey: AppConfigPropertyKey,
    value: boolean,
    callback?: (newValue: boolean) => void,
) {
    const onPress = () => {
        if (callback) {
            callback(!value);
        } else {
            Config.setConfig(changeKey, !value);
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
    changeKey: AppConfigPropertyKey,
    candidates: Array<string | number>,
    value: string | number,
    valueMap?: Record<string | number, string | number>,
    onChange?: (value: string | number) => void,
) {
    const onPress = () => {
        showDialog("RadioDialog", {
            title,
            content: valueMap
                ? candidates.map(_ => ({
                    label: valueMap[_] as string,
                    value: _,
                }))
                : candidates,
            onOk(val) {
                Config.setConfig(changeKey, val);
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
            getCacheSize("music"),
            getCacheSize("lyric"),
            getCacheSize("image"),
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

    const autoPlayWhenAppStart = useAppConfig("basic.autoPlayWhenAppStart");
    const useCelluarNetworkPlay = useAppConfig("basic.useCelluarNetworkPlay");
    const useCelluarNetworkDownload = useAppConfig("basic.useCelluarNetworkDownload");
    const maxDownload = useAppConfig("basic.maxDownload");
    const clickMusicInSearch = useAppConfig("basic.clickMusicInSearch");
    const clickMusicInAlbum = useAppConfig("basic.clickMusicInAlbum");
    const downloadPath = useAppConfig("basic.downloadPath");
    const notInterrupt = useAppConfig("basic.notInterrupt");
    const tempRemoteDuck = useAppConfig("basic.tempRemoteDuck");
    const tempRemoteDuckVolume = useAppConfig("basic.tempRemoteDuckVolume");
    const autoStopWhenError = useAppConfig("basic.autoStopWhenError");
    const maxCacheSize = useAppConfig("basic.maxCacheSize");
    const defaultPlayQuality = useAppConfig("basic.defaultPlayQuality");
    const playQualityOrder = useAppConfig("basic.playQualityOrder");
    const defaultDownloadQuality = useAppConfig("basic.defaultDownloadQuality");
    const downloadQualityOrder = useAppConfig("basic.downloadQualityOrder");
    const musicDetailDefault = useAppConfig("basic.musicDetailDefault");
    const musicDetailAwake = useAppConfig("basic.musicDetailAwake");
    const maxHistoryLen = useAppConfig("basic.maxHistoryLen");
    const autoUpdatePlugin = useAppConfig("basic.autoUpdatePlugin");
    const notCheckPluginVersion = useAppConfig("basic.notCheckPluginVersion");
    const associateLyricType = useAppConfig("basic.associateLyricType");
    const showExitOnNotification = useAppConfig("basic.showExitOnNotification");
    const musicOrderInLocalSheet = useAppConfig("basic.musicOrderInLocalSheet");
    const tryChangeSourceWhenPlayFail = useAppConfig("basic.tryChangeSourceWhenPlayFail");

    const { t } = useI18N();

    const debugEnableErrorLog = useAppConfig("debug.errorLog");
    const debugEnableTraceLog = useAppConfig("debug.traceLog");
    const debugEnableDevLog = useAppConfig("debug.devLog");

    const navigate = useNavigate();

    const [cacheSize, refreshCacheSize] = useCacheSize();

    const sectionListRef = useRef<SectionList | null>(null);
    // const titleListRef = useRef<FlatList | null>(null);

    useEffect(() => {
        refreshCacheSize();
    }, []);

    const basicOptions = [
        {
            title: t("basicSettings.common"),
            data: [
                createRadio(
                    t("basicSettings.maxHistoryLength"),
                    "basic.maxHistoryLen",
                    [20, 50, 100, 200, 500],
                    maxHistoryLen ?? 50,
                ),
                createRadio(
                    t("basicSettings.musicDetailDefault"),
                    "basic.musicDetailDefault",
                    ["album", "lyric"],
                    musicDetailDefault ?? "album",
                    {
                        album: t("basicSettings.musicDetailDefault.album"),
                        lyric: t("basicSettings.musicDetailDefault.lyric"),
                    },
                ),
                createSwitch(
                    t("basicSettings.musicDetailAwake"),
                    "basic.musicDetailAwake",
                    musicDetailAwake ?? false,
                ),
                createRadio(
                    t("basicSettings.associateLyricType"),
                    "basic.associateLyricType",
                    ["input", "search"],
                    associateLyricType ?? "search",
                    {
                        input: t("basicSettings.associateLyricType.input"),
                        search: t("basicSettings.associateLyricType.search"),
                    },
                ),
                createSwitch(
                    t("basicSettings.showExitOnNotification"),
                    "basic.showExitOnNotification",
                    showExitOnNotification ?? false,
                ),
            ],
        },
        {
            title: t("basicSettings.sheetAndAlbum"),
            data: [
                createRadio(
                    t("basicSettings.clickMusicInSearch"),
                    "basic.clickMusicInSearch",
                    ["playMusic", "playMusicAndReplace"],
                    clickMusicInSearch ?? "playMusic",
                    {
                        playMusic: t("basicSettings.clickMusicInSearch.playMusic"),
                        playMusicAndReplace: t("basicSettings.clickMusicInSearch.playMusicAndReplace"),
                    },
                ),
                createRadio(
                    t("basicSettings.clickMusicInAlbum"),
                    "basic.clickMusicInAlbum",
                    ["playMusic", "playAlbum"],
                    clickMusicInAlbum ?? "playAlbum",
                    {
                        playMusic: t("basicSettings.clickMusicInAlbum.playMusic"),
                        playAlbum: t("basicSettings.clickMusicInAlbum.playAlbum"),
                    },
                ),
                createRadio(
                    t("basicSettings.musicDetailDefault"),
                    "basic.musicDetailDefault",
                    ["album", "lyric"],
                    musicDetailDefault ?? "album",
                    {
                        album: t("basicSettings.musicDetailDefault.album"),
                        lyric: t("basicSettings.musicDetailDefault.lyric"),
                    },
                ),
                createRadio(
                    t("basicSettings.musicOrderInLocalSheet"),
                    "basic.musicOrderInLocalSheet",
                    [
                        SortType.Title,
                        SortType.Artist,
                        SortType.Album,
                        SortType.Newest,
                        SortType.Oldest,
                    ],
                    musicOrderInLocalSheet ?? "end",
                    {
                        [SortType.Title]: t("basicSettings.musicOrderInLocalSheet.title"),
                        [SortType.Artist]: t("basicSettings.musicOrderInLocalSheet.artist"),
                        [SortType.Album]: t("basicSettings.musicOrderInLocalSheet.album"),
                        [SortType.Newest]: t("basicSettings.musicOrderInLocalSheet.newest"),
                        [SortType.Oldest]: t("basicSettings.musicOrderInLocalSheet.oldest"),
                    },
                ),
            ],
        },
        {
            title: t("basicSettings.plugin"),
            data: [
                createSwitch(
                    t("basicSettings.autoUpdatePlugin"),
                    "basic.autoUpdatePlugin",
                    autoUpdatePlugin ?? false,
                ),
                createSwitch(
                    t("basicSettings.notCheckPluginVersion"),
                    "basic.notCheckPluginVersion",
                    notCheckPluginVersion ?? false,
                ),
            ],
        },
        {
            title: t("basicSettings.playback"),
            data: [
                createSwitch(
                    t("basicSettings.notInterrupt"),
                    "basic.notInterrupt",
                    notInterrupt ?? false,
                ),
                createSwitch(
                    t("basicSettings.autoPlayWhenAppStart"),
                    "basic.autoPlayWhenAppStart",
                    autoPlayWhenAppStart ?? false,
                ),
                createSwitch(
                    t("basicSettings.tryChangeSourceWhenPlayFail"),
                    "basic.tryChangeSourceWhenPlayFail",
                    tryChangeSourceWhenPlayFail ?? false,
                ),
                createSwitch(
                    t("basicSettings.autoStopWhenError"),
                    "basic.autoStopWhenError",
                    autoStopWhenError ?? false,
                ),
                createRadio(
                    t("basicSettings.tempRemoteDuck"),
                    "basic.tempRemoteDuck",
                    ["pause", "lowerVolume"],
                    tempRemoteDuck ?? "pause",
                    {
                        pause: t("basicSettings.tempRemoteDuck.pause"),
                        "lowerVolume": t("basicSettings.tempRemoteDuck.lowerVolume"),
                    }
                ),
                ...(tempRemoteDuck === "lowerVolume" ? [
                    createRadio(
                        t("basicSettings.tempRemoteDuck.volumeDecreaseLevel"),
                        "basic.tempRemoteDuckVolume",
                        [0.3, 0.5, 0.8],
                        tempRemoteDuckVolume ?? 0.5,
                        {
                            0.3: "30%",
                            0.5: "50%",
                            0.8: "80%",
                        }
                    ),
                ] : []),
                createRadio(
                    t("basicSettings.defaultPlayQuality"),
                    "basic.defaultPlayQuality",
                    qualityKeys,
                    defaultPlayQuality ?? "standard",
                    {
                        low: t("musicQuality.low"),
                        standard: t("musicQuality.standard"),
                        high: t("musicQuality.high"),
                        super: t("musicQuality.super"),
                    },
                ),
                createRadio(
                    t("basicSettings.playQualityOrder"),
                    "basic.playQualityOrder",
                    ["asc", "desc"],
                    playQualityOrder ?? "asc",
                    {
                        asc: t("basicSettings.playQualityOrder.asc"),
                        desc: t("basicSettings.playQualityOrder.desc"),
                    },
                ),
            ],
        },
        {
            title: t("basicSettings.download"),
            data: [
                {
                    title: t("basicSettings.downloadPath"),
                    right: (
                        <ThemeText
                            fontSize="subTitle"
                            style={styles.centerText}
                            numberOfLines={3}>
                            {downloadPath ??
                                pathConst.downloadMusicPath}
                        </ThemeText>
                    ),
                    onPress() {
                        navigate<"file-selector">(ROUTE_PATH.FILE_SELECTOR, {
                            fileType: "folder",
                            multi: false,
                            actionText: t("basicSettings.fileSelector.selectFolder"),
                            async onAction(selectedFiles) {
                                try {
                                    const targetDir = selectedFiles[0];
                                    await readdir(targetDir.path);
                                    Config.setConfig(
                                        "basic.downloadPath",
                                        targetDir.path,
                                    );
                                    return true;
                                } catch {
                                    Toast.warn(t("toast.folderNotExistOrNoPermission"));
                                    return false;
                                }
                            },
                        });
                    },
                },
                createRadio(
                    t("basicSettings.maxDownload"),
                    "basic.maxDownload",
                    [1, 3, 5, 7],
                    maxDownload ?? 3,
                ),
                createRadio(
                    t("basicSettings.defaultDownloadQuality"),
                    "basic.defaultDownloadQuality",
                    qualityKeys,
                    defaultDownloadQuality ?? "standard",
                    {
                        low: t("musicQuality.low"),
                        standard: t("musicQuality.standard"),
                        high: t("musicQuality.high"),
                        super: t("musicQuality.super"),
                    },
                ),
                createRadio(
                    t("basicSettings.downloadQualityOrder"),
                    "basic.downloadQualityOrder",
                    ["asc", "desc"],
                    downloadQualityOrder ?? "asc",
                    {
                        asc: t("basicSettings.downloadQualityOrder.asc"),
                        desc: t("basicSettings.downloadQualityOrder.desc"),
                    },
                ),
            ],
        },
        {
            title: t("basicSettings.network"),
            data: [
                createSwitch(
                    t("basicSettings.useCelluarNetworkPlay"),
                    "basic.useCelluarNetworkPlay",
                    useCelluarNetworkPlay ?? false,
                ),
                createSwitch(
                    t("basicSettings.useCelluarNetworkDownload"),
                    "basic.useCelluarNetworkDownload",
                    useCelluarNetworkDownload ?? false,
                ),
            ],
        },
        {
            title: t("basicSettings.lyric"),
            data: [],
            footer: <LyricSetting />,
        },
        {
            title: t("basicSettings.cache"),
            data: [
                {
                    title: t("basicSettings.cache.musicCacheLimit"),
                    right: (
                        <ThemeText style={styles.centerText}>
                            {maxCacheSize
                                ? sizeFormatter(maxCacheSize)
                                : "512M"}
                        </ThemeText>
                    ),
                    onPress() {
                        showPanel("SimpleInput", {
                            title: t("dialog.setCacheTitle"),
                            placeholder: t("dialog.setCachePlaceholder"),
                            onOk(text, closePanel) {
                                let val = parseInt(text);
                                if (val < 100) {
                                    val = 100;
                                } else if (val > 8192) {
                                    val = 8192;
                                }
                                if (val >= 100 && val <= 8192) {
                                    Config.setConfig(
                                        "basic.maxCacheSize",
                                        val * 1024 * 1024,
                                    );
                                    closePanel();
                                    Toast.success(t("toast.cacheSetSuccess"));
                                }
                            },
                        });
                    },
                },

                {
                    title: t("basicSettings.cache.clearMusicCache"),
                    right: (
                        <ThemeText style={styles.centerText}>
                            {sizeFormatter(cacheSize.music)}
                        </ThemeText>
                    ),
                    onPress() {
                        showDialog("SimpleDialog", {
                            title: t("dialog.clearMusicCacheTitle"),
                            content: t("dialog.clearMusicCacheContent"),
                            async onOk() {
                                await clearCache("music");
                                Toast.success(t("toast.musicCacheCleared"));
                                refreshCacheSize();
                            },
                        });
                    },
                },
                {
                    title: t("basicSettings.cache.clearLyricCache"),
                    right: (
                        <ThemeText style={styles.centerText}>
                            {sizeFormatter(cacheSize.lyric)}
                        </ThemeText>
                    ),
                    onPress() {
                        showDialog("SimpleDialog", {
                            title: t("dialog.clearLyricCacheTitle"),
                            content: t("dialog.clearLyricCacheContent"),
                            async onOk() {
                                await clearCache("lyric");
                                Toast.success(t("toast.lyricCacheCleared"));
                                refreshCacheSize();
                            },
                        });
                    },
                },
                {
                    title: t("basicSettings.cache.clearImageCache"),
                    right: (
                        <ThemeText style={styles.centerText}>
                            {sizeFormatter(cacheSize.image)}
                        </ThemeText>
                    ),
                    onPress() {
                        showDialog("SimpleDialog", {
                            title: t("dialog.clearImageCacheTitle"),
                            content: t("dialog.clearImageCacheContent"),
                            async onOk() {
                                await clearCache("image");
                                Toast.success(t("toast.imageCacheCleared"));
                                refreshCacheSize();
                            },
                        });
                    },
                },
            ],
        },
        {
            title: t("basicSettings.developer"),
            data: [
                createSwitch(
                    t("basicSettings.developer.errorLog"),
                    "debug.errorLog",
                    debugEnableErrorLog ?? false,
                ),
                createSwitch(
                    t("basicSettings.developer.traceLog"),
                    "debug.traceLog",
                    debugEnableTraceLog ?? false,
                ),
                createSwitch(
                    t("basicSettings.developer.devLog"),
                    "debug.devLog",
                    debugEnableDevLog ?? false,
                ),
                {
                    title: t("basicSettings.developer.viewErrorLog"),
                    right: undefined,
                    async onPress() {
                        // 获取日志文件夹
                        const errorLogContent = await getErrorLogContent();
                        showDialog("SimpleDialog", {
                            title: t("dialog.errorLogTitle"),
                            content: (
                                <ScrollView>
                                    <Paragraph>
                                        {errorLogContent || t("dialog.errorLogNoRecord")}
                                    </Paragraph>
                                </ScrollView>
                            ),
                            cancelText: t("dialog.errorLogKnow"),
                            okText: t("dialog.errorLogCopy"),
                            onOk() {
                                Clipboard.setString(errorLogContent);
                                Toast.success(t("toast.copiedToClipboard"));
                            },
                        });
                    },
                },
                {
                    title: t("basicSettings.developer.clearLog"),
                    right: undefined,
                    async onPress() {
                        try {
                            await clearLog();
                            Toast.success(t("toast.logCleared"));
                        } catch { }
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
                renderItem={({ item, index }) => (
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
                renderSectionHeader={({ section }) => (
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
                renderSectionFooter={({ section }) => {
                    return section.footer ?? null;
                }}
                renderItem={({ item }) => {
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
        width: "100%",
        paddingBottom: rpx(24),
        flex: 1,
    },
    centerText: {
        textAlignVertical: "center",
        maxWidth: rpx(400),
    },
    sectionHeader: {
        paddingHorizontal: rpx(24),
        height: rpx(72),
        flexDirection: "row",
        alignItems: "center",
        marginTop: rpx(20),
    },
    headerContainer: {
        height: rpx(80),
    },
    headerContentContainer: {
        height: rpx(80),
        alignItems: "center",
        paddingHorizontal: rpx(24),
    },
    headerItemStyle: {
        paddingHorizontal: rpx(36),
        height: rpx(80),
        justifyContent: "center",
        alignItems: "center",
    },
});

function LyricSetting() {
    /**
     * // Lyric
     *     "lyric.showStatusBarLyric": boolean;
     *     "lyric.topPercent": number;
     *     "lyric.leftPercent": number;
     *     "lyric.align": number;
     *     "lyric.color": string;
     *     "lyric.backgroundColor": string;
     *     "lyric.widthPercent": number;
     *     "lyric.fontSize": number;
     *     "lyric.detailFontSize": number;
     *     "lyric.autoSearchLyric": boolean;
     */
    const showStatusBarLyric = useAppConfig("lyric.showStatusBarLyric");
    const topPercent = useAppConfig("lyric.topPercent");
    const leftPercent = useAppConfig("lyric.leftPercent");
    const align = useAppConfig("lyric.align");
    const color = useAppConfig("lyric.color");
    const backgroundColor = useAppConfig("lyric.backgroundColor");
    const widthPercent = useAppConfig("lyric.widthPercent");
    const fontSize = useAppConfig("lyric.fontSize");
    const enableAutoSearchLyric = useAppConfig("lyric.autoSearchLyric");



    const colors = useColors();

    const { t } = useI18N();

    const autoSearchLyric = createSwitch(
        t("basicSettings.lyric.autoSearchLyric"),
        "lyric.autoSearchLyric",
        enableAutoSearchLyric ?? false,
    );

    const openStatusBarLyric = createSwitch(
        t("basicSettings.lyric.showStatusBarLyric"),
        "lyric.showStatusBarLyric",
        showStatusBarLyric ?? false,
        async newValue => {
            try {
                if (newValue) {
                    const hasPermission =
                        await LyricUtil.checkSystemAlertPermission();

                    if (hasPermission) {
                        const statusBarLyricConfig = {
                            topPercent: Config.getConfig("lyric.topPercent"),
                            leftPercent: Config.getConfig("lyric.leftPercent"),
                            align: Config.getConfig("lyric.align"),
                            color: Config.getConfig("lyric.color"),
                            backgroundColor: Config.getConfig("lyric.backgroundColor"),
                            widthPercent: Config.getConfig("lyric.widthPercent"),
                            fontSize: Config.getConfig("lyric.fontSize"),
                        };
                        LyricUtil.showStatusBarLyric(
                            "MusicFree",
                            statusBarLyricConfig ?? {}
                        );
                        Config.setConfig("lyric.showStatusBarLyric", true);
                    } else {
                        LyricUtil.requestSystemAlertPermission().finally(() => {
                            Toast.warn(t("toast.noFloatWindowPermission"));
                        });
                    }
                } else {
                    LyricUtil.hideStatusBarLyric();
                    Config.setConfig("lyric.showStatusBarLyric", false);
                }
            } catch { }
        },
    );

    const alignStatusBarLyric = createRadio(
        t("basicSettings.lyric.align"),
        "lyric.align",
        [
            NativeTextAlignment.LEFT,
            NativeTextAlignment.CENTER,
            NativeTextAlignment.RIGHT,
        ],
        align ?? NativeTextAlignment.CENTER,
        {
            [NativeTextAlignment.LEFT]: t("basicSettings.lyric.align.left"),
            [NativeTextAlignment.CENTER]: t("basicSettings.lyric.align.center"),
            [NativeTextAlignment.RIGHT]: t("basicSettings.lyric.align.right"),
        },
        newVal => {
            if (showStatusBarLyric) {
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
                <ThemeText>{t("basicSettings.lyric.leftRightDistance")}</ThemeText>
                <Slider
                    style={lyricStyles.slider}
                    minimumTrackTintColor={colors.primary}
                    maximumTrackTintColor={colors.text ?? "#999999"}
                    thumbTintColor={colors.primary}
                    minimumValue={0}
                    step={0.01}
                    value={leftPercent ?? 0.5}
                    maximumValue={1}
                    onValueChange={val => {
                        if (showStatusBarLyric) {
                            LyricUtil.setStatusBarLyricLeft(val);
                        }
                    }}
                    onSlidingComplete={val => {
                        Config.setConfig("lyric.leftPercent", val);
                    }}
                />
            </View>
            <View style={lyricStyles.sliderContainer}>
                <ThemeText>{t("basicSettings.lyric.topBottomDistance")}</ThemeText>
                <Slider
                    style={lyricStyles.slider}
                    minimumTrackTintColor={colors.primary}
                    maximumTrackTintColor={colors.text ?? "#999999"}
                    thumbTintColor={colors.primary}
                    minimumValue={0}
                    value={topPercent ?? 0}
                    step={0.01}
                    maximumValue={1}
                    onValueChange={val => {
                        if (showStatusBarLyric) {
                            LyricUtil.setStatusBarLyricTop(val);
                        }
                    }}
                    onSlidingComplete={val => {
                        Config.setConfig("lyric.topPercent", val);
                    }}
                />
            </View>
            <View style={lyricStyles.sliderContainer}>
                <ThemeText>{t("basicSettings.lyric.width")}</ThemeText>
                <Slider
                    style={lyricStyles.slider}
                    minimumTrackTintColor={colors.primary}
                    maximumTrackTintColor={colors.text ?? "#999999"}
                    thumbTintColor={colors.primary}
                    minimumValue={0}
                    step={0.01}
                    value={widthPercent ?? 0.5}
                    maximumValue={1}
                    onValueChange={val => {
                        if (showStatusBarLyric) {
                            LyricUtil.setStatusBarLyricWidth(val);
                        }
                    }}
                    onSlidingComplete={val => {
                        Config.setConfig("lyric.widthPercent", val);
                    }}
                />
            </View>
            <View style={lyricStyles.sliderContainer}>
                <ThemeText>{t("basicSettings.lyric.fontSize")}</ThemeText>
                <Slider
                    style={lyricStyles.slider}
                    minimumTrackTintColor={colors.primary}
                    maximumTrackTintColor={colors.text ?? "#999999"}
                    thumbTintColor={colors.primary}
                    minimumValue={Math.round(rpx(18))}
                    step={0.5}
                    maximumValue={Math.round(rpx(56))}
                    value={fontSize ?? Math.round(rpx(24))}
                    onValueChange={val => {
                        if (showStatusBarLyric) {
                            LyricUtil.setStatusBarLyricFontSize(val);
                        }
                    }}
                    onSlidingComplete={val => {
                        Config.setConfig("lyric.fontSize", val);
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
                    showPanel("ColorPicker", {
                        closePanelWhenSelected: true,
                        defaultColor: color ?? "transparent",
                        onSelected(color) {
                            if (showStatusBarLyric) {
                                const colorStr = color.hexa();
                                LyricUtil.setStatusBarColors(colorStr, null);
                                Config.setConfig("lyric.color", colorStr);
                            }
                        },
                    });
                }}>
                <ListItem.Content title={t("basicSettings.lyric.textColor")} />
                <ColorBlock color={color ?? "#FFE9D2FF"} />
            </ListItem>
            <ListItem
                withHorizontalPadding
                heightType="small"
                onPress={() => {
                    showPanel("ColorPicker", {
                        closePanelWhenSelected: true,
                        defaultColor:
                            backgroundColor ?? "transparent",
                        onSelected(color) {
                            if (showStatusBarLyric) {
                                const colorStr = color.hexa();
                                LyricUtil.setStatusBarColors(null, colorStr);
                                Config.setConfig(
                                    "lyric.backgroundColor",
                                    colorStr,
                                );
                            }
                        },
                    });
                }}>
                <ListItem.Content title={t("basicSettings.lyric.backgroundColor")} />
                <ColorBlock
                    color={backgroundColor ?? "#84888153"}
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
        width: "100%",
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: rpx(24),
    },
});
