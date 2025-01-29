import { CustomizedColors } from "@/hooks/useColors";
import { getStorage, removeStorage } from "@/utils/storage";
import { ResumeMode, SortType } from "@/constants/commonConst.ts";
import getOrCreateMMKV from "@/utils/getOrCreateMMKV.ts";
import safeStringify from "@/utils/safeStringify.ts";
import { useMMKVObject } from "react-native-mmkv";


const configStore = getOrCreateMMKV('App.config');

// 新版本配置类型（扁平化结构）
interface IConfig {
    "$schema": "1";
    // Basic
    "basic.autoPlayWhenAppStart": boolean;
    "basic.useCelluarNetworkPlay": boolean;
    "basic.useCelluarNetworkDownload": boolean;
    "basic.maxDownload": number | string;
    "basic.clickMusicInSearch": '播放歌曲' | '播放歌曲并替换播放列表';
    "basic.clickMusicInAlbum": '播放专辑' | '播放单曲';
    "basic.downloadPath": string;
    "basic.notInterrupt": boolean;
    "basic.tempRemoteDuck": '暂停' | '降低音量';
    "basic.autoStopWhenError": boolean;
    "basic.pluginCacheControl": string;
    "basic.maxCacheSize": number;
    "basic.defaultPlayQuality": IMusic.IQualityKey;
    "basic.playQualityOrder": 'asc' | 'desc';
    "basic.defaultDownloadQuality": IMusic.IQualityKey;
    "basic.downloadQualityOrder": 'asc' | 'desc';
    "basic.musicDetailDefault": 'album' | 'lyric';
    "basic.musicDetailAwake": boolean;
    "basic.maxHistoryLen": number;
    "basic.autoUpdatePlugin": boolean;
    "basic.notCheckPluginVersion": boolean;
    "basic.associateLyricType": 'input' | 'search';
    "basic.showExitOnNotification": boolean;
    "basic.musicOrderInLocalSheet": SortType;
    "basic.tryChangeSourceWhenPlayFail": boolean;

    // Lyric
    "lyric.showStatusBarLyric": boolean;
    "lyric.topPercent": number;
    "lyric.leftPercent": number;
    "lyric.align": number;
    "lyric.color": string;
    "lyric.backgroundColor": string;
    "lyric.widthPercent": number;
    "lyric.fontSize": number;
    "lyric.detailFontSize": number;
    "lyric.autoSearchLyric": boolean;

    // Theme
    "theme.background": string;
    "theme.backgroundOpacity": number;
    "theme.backgroundBlur": number;
    "theme.colors": CustomizedColors;
    "theme.customColors"?: CustomizedColors;
    "theme.followSystem": boolean;
    "theme.selectedTheme": string;

    // Backup
    "backup.resumeMode": ResumeMode;

    // Plugin
    "plugin.subscribeUrl": string;

    // WebDAV
    "webdav.url": string;
    "webdav.username": string;
    "webdav.password": string;

    // Debug（保持嵌套结构）
    "debug.errorLog": boolean;
    "debug.traceLog": boolean;
    "debug.devLog": boolean;
}


export type ConfigKey = keyof IConfig;

// 迁移函数
async function migrateConfig(): Promise<void> {
    // 检查是否已经迁移
    if (configStore.contains('$schema')) {
        return;
    }

    // 获取旧配置
    const oldConfig = await getStorage('local-config');

    // 如果没有旧配置，直接初始化新配置
    if (!oldConfig) {
        configStore.set('$schema', '1');
        return;
    }

    // 迁移每个字段
    const mapping: [string, ConfigKey][] = [
        // Basic
        ['setting.basic.autoPlayWhenAppStart', 'basic.autoPlayWhenAppStart'],
        ['setting.basic.useCelluarNetworkPlay', 'basic.useCelluarNetworkPlay'],
        ['setting.basic.useCelluarNetworkDownload', 'basic.useCelluarNetworkDownload'],
        ['setting.basic.maxDownload', 'basic.maxDownload'],
        ['setting.basic.clickMusicInSearch', 'basic.clickMusicInSearch'],
        ['setting.basic.clickMusicInAlbum', 'basic.clickMusicInAlbum'],
        ['setting.basic.downloadPath', 'basic.downloadPath'],
        ['setting.basic.notInterrupt', 'basic.notInterrupt'],
        ['setting.basic.tempRemoteDuck', 'basic.tempRemoteDuck'],
        ['setting.basic.autoStopWhenError', 'basic.autoStopWhenError'],
        ['setting.basic.pluginCacheControl', 'basic.pluginCacheControl'],
        ['setting.basic.maxCacheSize', 'basic.maxCacheSize'],
        ['setting.basic.defaultPlayQuality', 'basic.defaultPlayQuality'],
        ['setting.basic.playQualityOrder', 'basic.playQualityOrder'],
        ['setting.basic.defaultDownloadQuality', 'basic.defaultDownloadQuality'],
        ['setting.basic.downloadQualityOrder', 'basic.downloadQualityOrder'],
        ['setting.basic.musicDetailDefault', 'basic.musicDetailDefault'],
        ['setting.basic.musicDetailAwake', 'basic.musicDetailAwake'],
        ['setting.basic.debug.errorLog', 'debug.errorLog'],
        ['setting.basic.debug.traceLog', 'debug.traceLog'],
        ['setting.basic.debug.devLog', 'debug.devLog'],
        ['setting.basic.maxHistoryLen', 'basic.maxHistoryLen'],
        ['setting.basic.autoUpdatePlugin', 'basic.autoUpdatePlugin'],
        ['setting.basic.notCheckPluginVersion', 'basic.notCheckPluginVersion'],
        ['setting.basic.associateLyricType', 'basic.associateLyricType'],
        ['setting.basic.showExitOnNotification', 'basic.showExitOnNotification'],
        ['setting.basic.musicOrderInLocalSheet', 'basic.musicOrderInLocalSheet'],
        ['setting.basic.tryChangeSourceWhenPlayFail', 'basic.tryChangeSourceWhenPlayFail'],

        // Lyric
        ['setting.lyric.showStatusBarLyric', 'lyric.showStatusBarLyric'],
        ['setting.lyric.topPercent', 'lyric.topPercent'],
        ['setting.lyric.leftPercent', 'lyric.leftPercent'],
        ['setting.lyric.align', 'lyric.align'],
        ['setting.lyric.color', 'lyric.color'],
        ['setting.lyric.backgroundColor', 'lyric.backgroundColor'],
        ['setting.lyric.widthPercent', 'lyric.widthPercent'],
        ['setting.lyric.fontSize', 'lyric.fontSize'],
        ['setting.lyric.detailFontSize', 'lyric.detailFontSize'],
        ['setting.lyric.autoSearchLyric', 'lyric.autoSearchLyric'],

        // Theme
        ['setting.theme.background', 'theme.background'],
        ['setting.theme.backgroundOpacity', 'theme.backgroundOpacity'],
        ['setting.theme.backgroundBlur', 'theme.backgroundBlur'],
        ['setting.theme.colors', 'theme.colors'],
        ['setting.theme.customColors', 'theme.customColors'],
        ['setting.theme.followSystem', 'theme.followSystem'],
        ['setting.theme.selectedTheme', 'theme.selectedTheme'],

        // Backup
        ['setting.backup.resumeMode', 'backup.resumeMode'],

        // Plugin
        ['setting.plugin.subscribeUrl', 'plugin.subscribeUrl'],

        // WebDAV
        ['setting.webdav.url', 'webdav.url'],
        ['setting.webdav.username', 'webdav.username'],
        ['setting.webdav.password', 'webdav.password'],
    ];

    // 执行迁移
    function getPathValue(obj: Record<string, any>, path: string) {
        const keys = path.split('.');
        let tmp = obj;
        for (let i = 0; i < keys.length; ++i) {
            tmp = tmp?.[keys[i]];
        }
        return tmp;
    }

    mapping.forEach(([oldPath, newKey]) => {
        const value = getPathValue(oldConfig, oldPath);
        if (value !== undefined) {
            configStore.set(newKey, safeStringify(value));
        }
    });

    // 设置版本标识
    configStore.set('$schema', '1');

    // 清理旧配置
    await removeStorage('local-config'); // 根据需求决定是否删除旧配置
}

/** 初始化config */
async function setup() {
    await migrateConfig();
}

function setConfig<K extends ConfigKey>(key: K, value?: IConfig[K]) {
    if (value === undefined) {
        configStore.delete(key);
    } else {
        configStore.set(key, safeStringify(value));
    }
}

function getConfig<K extends ConfigKey>(key: K): IConfig[K] | undefined {
    const value = configStore.getString(key);
    if (value === undefined) {
        return undefined;
    }
    return JSON.parse(value);
}


function useConfig<K extends ConfigKey>(key: K) {
    return useMMKVObject<IConfig[K]>(key, configStore);
}

function useConfigValue<K extends ConfigKey>(key: K) {
    return useMMKVObject<IConfig[K]>(key, configStore)[0];
}

const Config = {
    setup,
    setConfig,
    getConfig,
    useConfig,
    useConfigValue
}

export default Config;
