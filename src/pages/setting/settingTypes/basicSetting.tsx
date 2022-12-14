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
import {qualityKeys, qualityText} from '@/utils/qualities';

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
            title: '??????',
            data: [
                createSwitch(
                    '?????????????????????????????????',
                    'setting.basic.notInterrupt',
                    basicSetting?.notInterrupt ?? false,
                ),
                createRadio(
                    '????????????????????????',
                    'setting.basic.tempRemoteDuck',
                    ['??????', '????????????'],
                    basicSetting?.tempRemoteDuck ?? '??????',
                ),
                createSwitch(
                    '???????????????????????????',
                    'setting.basic.autoStopWhenError',
                    basicSetting?.autoStopWhenError ?? false,
                ),
                createRadio(
                    '??????????????????????????????',
                    'setting.basic.clickMusicInSearch',
                    ['????????????', '?????????????????????????????????'],
                    basicSetting?.clickMusicInSearch ?? '????????????',
                ),
                createRadio(
                    '????????????????????????',
                    'setting.basic.clickMusicInAlbum',
                    ['????????????', '????????????'],
                    basicSetting?.clickMusicInAlbum ?? '????????????',
                ),
                createRadio(
                    '??????????????????',
                    'setting.basic.defaultPlayQuality',
                    qualityKeys,
                    basicSetting?.defaultPlayQuality ?? 'standard',
                    qualityText,
                ),
                createRadio(
                    '???????????????????????????',
                    'setting.basic.playQualityOrder',
                    ['asc', 'desc'],
                    basicSetting?.playQualityOrder ?? 'asc',
                    {
                        asc: '??????????????????',
                        desc: '??????????????????',
                    },
                ),
            ],
        },
        {
            title: '??????',
            data: [
                {
                    title: '????????????',
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
                            actionText: '???????????????',
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
                                    Toast.warn('??????????????????????????????');
                                    return false;
                                }
                            },
                        });
                    },
                },
                createRadio(
                    '????????????????????????',
                    'setting.basic.maxDownload',
                    [1, 3, 5, 7],
                    basicSetting?.maxDownload ?? 3,
                ),
                createRadio(
                    '??????????????????',
                    'setting.basic.defaultDownloadQuality',
                    qualityKeys,
                    basicSetting?.defaultDownloadQuality ?? 'standard',
                    qualityText,
                ),
                createRadio(
                    '???????????????????????????',
                    'setting.basic.downloadQualityOrder',
                    ['asc', 'desc'],
                    basicSetting?.downloadQualityOrder ?? 'asc',
                    {
                        asc: '??????????????????',
                        desc: '??????????????????',
                    },
                ),
            ],
        },
        {
            title: '??????',
            data: [
                createSwitch(
                    '????????????????????????',
                    'setting.basic.useCelluarNetworkPlay',
                    basicSetting?.useCelluarNetworkPlay ?? false,
                ),
                createSwitch(
                    '????????????????????????',
                    'setting.basic.useCelluarNetworkDownload',
                    basicSetting?.useCelluarNetworkDownload ?? false,
                ),
            ],
        },
        {
            title: '??????',
            data: [
                {
                    title: '??????????????????',
                    right: () => (
                        <ThemeText style={style.centerText}>
                            {basicSetting?.maxCacheSize
                                ? sizeFormatter(basicSetting.maxCacheSize)
                                : '512M'}
                        </ThemeText>
                    ),
                    onPress() {
                        showPanel('SimpleInput', {
                            placeholder: '???????????????????????????100M-8192M?????????M',
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
                                    Toast.success('????????????');
                                }
                            },
                        });
                    },
                },

                {
                    title: '??????????????????',
                    right: () => (
                        <ThemeText style={style.centerText}>
                            {sizeFormatter(cacheSize.music)}
                        </ThemeText>
                    ),
                    onPress() {
                        showDialog('SimpleDialog', {
                            title: '??????????????????',
                            content: '????????????????????????????',
                            async onOk() {
                                await clearCache('music');
                                Toast.success('?????????????????????');
                                refreshCacheSize();
                            },
                        });
                    },
                },
                {
                    title: '??????????????????',
                    right: () => (
                        <ThemeText style={style.centerText}>
                            {sizeFormatter(cacheSize.lyric)}
                        </ThemeText>
                    ),
                    onPress() {
                        showDialog('SimpleDialog', {
                            title: '??????????????????',
                            content: '????????????????????????????',
                            async onOk() {
                                await clearCache('lyric');
                                Toast.success('?????????????????????');
                                refreshCacheSize();
                            },
                        });
                    },
                },
                {
                    title: '??????????????????',
                    right: () => (
                        <ThemeText style={style.centerText}>
                            {sizeFormatter(cacheSize.image)}
                        </ThemeText>
                    ),
                    onPress() {
                        showDialog('SimpleDialog', {
                            title: '??????????????????',
                            content: '????????????????????????????',
                            async onOk() {
                                await clearCache('image');
                                Toast.success('?????????????????????');
                                refreshCacheSize();
                            },
                        });
                    },
                },
            ],
        },
        {
            title: '????????????',
            data: [
                createSwitch(
                    '??????????????????',
                    'setting.basic.debug.errorLog',
                    basicSetting?.debug?.errorLog ?? false,
                ),
                createSwitch(
                    '??????????????????',
                    'setting.basic.debug.traceLog',
                    basicSetting?.debug?.traceLog ?? false,
                ),
                createSwitch(
                    '????????????',
                    'setting.basic.debug.devLog',
                    basicSetting?.debug?.devLog ?? false,
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
