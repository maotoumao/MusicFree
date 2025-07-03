import type { ResumeMode, SortType } from "@/constants/commonConst.ts";
import type { CustomizedColors } from "@/hooks/useColors";

export interface IAppConfigProperties {
    $schema: "2";
    // Basic
    "basic.autoPlayWhenAppStart": boolean;
    "basic.useCelluarNetworkPlay": boolean;
    "basic.useCelluarNetworkDownload": boolean;
    "basic.maxDownload": number;
    "basic.clickMusicInSearch": "playMusic" | "playMusicAndReplace";
    "basic.clickMusicInAlbum": "playAlbum" | "playMusic";
    "basic.downloadPath": string;
    "basic.notInterrupt": boolean;
    "basic.tempRemoteDuck": "pause" | "lowerVolume";
    "basic.tempRemoteDuckVolume": 0.3 | 0.5 | 0.8;
    "basic.autoStopWhenError": boolean;
    "basic.pluginCacheControl": string;
    "basic.maxCacheSize": number;
    "basic.defaultPlayQuality": IMusic.IQualityKey;
    "basic.playQualityOrder": "asc" | "desc";
    "basic.defaultDownloadQuality": IMusic.IQualityKey;
    "basic.downloadQualityOrder": "asc" | "desc";
    "basic.musicDetailDefault": "album" | "lyric";
    "basic.musicDetailAwake": boolean;
    "basic.maxHistoryLen": number;
    "basic.autoUpdatePlugin": boolean;
    "basic.notCheckPluginVersion": boolean;
    "basic.associateLyricType": "input" | "search";
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

export type AppConfigPropertyKey = keyof IAppConfigProperties;

export interface IAppConfig<T extends IAppConfigProperties = IAppConfigProperties> {
    setup(): Promise<void>;

    setConfig<K extends keyof T>(key: K, value?: T[K]): void;

    getConfig<K extends keyof T>(key: K): T[K] | undefined;
}