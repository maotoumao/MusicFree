import { useMMKVObject } from "react-native-mmkv";

import { getStorage, removeStorage } from "@/utils/storage";
import getOrCreateMMKV from "@/utils/getOrCreateMMKV.ts";

import type { AppConfigPropertyKey, IAppConfig, IAppConfigProperties } from "@/types/core/config";
import { safeStringify } from "@/utils/jsonUtil";

const configStore = getOrCreateMMKV("App.config");

class AppConfig implements IAppConfig {
    // 迁移函数
    private async migrateConfig(): Promise<void> {

        const schemaVersion = !configStore.contains("$schema") ? 0 : parseInt(configStore.getString("$schema") || "0", 10);

        if (schemaVersion < 1) {
            // 获取旧配置
            const oldConfig = await getStorage("local-config");

            // 如果没有旧配置，直接初始化新配置
            if (!oldConfig) {
                configStore.set("$schema", "1");
                return;
            }

            // 迁移每个字段
            const mapping: [string, AppConfigPropertyKey][] = [
                // Basic
                [
                    "setting.basic.autoPlayWhenAppStart",
                    "basic.autoPlayWhenAppStart",
                ],
                [
                    "setting.basic.useCelluarNetworkPlay",
                    "basic.useCelluarNetworkPlay",
                ],
                [
                    "setting.basic.useCelluarNetworkDownload",
                    "basic.useCelluarNetworkDownload",
                ],
                ["setting.basic.maxDownload", "basic.maxDownload"],
                ["setting.basic.clickMusicInSearch", "basic.clickMusicInSearch"],
                ["setting.basic.clickMusicInAlbum", "basic.clickMusicInAlbum"],
                ["setting.basic.downloadPath", "basic.downloadPath"],
                ["setting.basic.notInterrupt", "basic.notInterrupt"],
                ["setting.basic.tempRemoteDuck", "basic.tempRemoteDuck"],
                ["setting.basic.autoStopWhenError", "basic.autoStopWhenError"],
                ["setting.basic.pluginCacheControl", "basic.pluginCacheControl"],
                ["setting.basic.maxCacheSize", "basic.maxCacheSize"],
                ["setting.basic.defaultPlayQuality", "basic.defaultPlayQuality"],
                ["setting.basic.playQualityOrder", "basic.playQualityOrder"],
                [
                    "setting.basic.defaultDownloadQuality",
                    "basic.defaultDownloadQuality",
                ],
                [
                    "setting.basic.downloadQualityOrder",
                    "basic.downloadQualityOrder",
                ],
                ["setting.basic.musicDetailDefault", "basic.musicDetailDefault"],
                ["setting.basic.musicDetailAwake", "basic.musicDetailAwake"],
                ["setting.basic.debug.errorLog", "debug.errorLog"],
                ["setting.basic.debug.traceLog", "debug.traceLog"],
                ["setting.basic.debug.devLog", "debug.devLog"],
                ["setting.basic.maxHistoryLen", "basic.maxHistoryLen"],
                ["setting.basic.autoUpdatePlugin", "basic.autoUpdatePlugin"],
                [
                    "setting.basic.notCheckPluginVersion",
                    "basic.notCheckPluginVersion",
                ],
                ["setting.basic.associateLyricType", "basic.associateLyricType"],
                [
                    "setting.basic.showExitOnNotification",
                    "basic.showExitOnNotification",
                ],
                [
                    "setting.basic.musicOrderInLocalSheet",
                    "basic.musicOrderInLocalSheet",
                ],
                [
                    "setting.basic.tryChangeSourceWhenPlayFail",
                    "basic.tryChangeSourceWhenPlayFail",
                ],

                // Lyric
                ["setting.lyric.showStatusBarLyric", "lyric.showStatusBarLyric"],
                ["setting.lyric.topPercent", "lyric.topPercent"],
                ["setting.lyric.leftPercent", "lyric.leftPercent"],
                ["setting.lyric.align", "lyric.align"],
                ["setting.lyric.color", "lyric.color"],
                ["setting.lyric.backgroundColor", "lyric.backgroundColor"],
                ["setting.lyric.widthPercent", "lyric.widthPercent"],
                ["setting.lyric.fontSize", "lyric.fontSize"],
                ["setting.lyric.detailFontSize", "lyric.detailFontSize"],
                ["setting.lyric.autoSearchLyric", "lyric.autoSearchLyric"],

                // Theme
                ["setting.theme.background", "theme.background"],
                ["setting.theme.backgroundOpacity", "theme.backgroundOpacity"],
                ["setting.theme.backgroundBlur", "theme.backgroundBlur"],
                ["setting.theme.colors", "theme.colors"],
                ["setting.theme.customColors", "theme.customColors"],
                ["setting.theme.followSystem", "theme.followSystem"],
                ["setting.theme.selectedTheme", "theme.selectedTheme"],

                // Backup
                ["setting.backup.resumeMode", "backup.resumeMode"],

                // Plugin
                ["setting.plugin.subscribeUrl", "plugin.subscribeUrl"],

                // WebDAV
                ["setting.webdav.url", "webdav.url"],
                ["setting.webdav.username", "webdav.username"],
                ["setting.webdav.password", "webdav.password"],
            ];

            // 执行迁移
            function getPathValue(obj: Record<string, any>, path: string) {
                const keys = path.split(".");
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
            configStore.set("$schema", "1");

            // 清理旧配置
            await removeStorage("local-config"); // 根据需求决定是否删除旧配置
        }

        if (schemaVersion < 2) {
            // @ts-expect-error 兼容旧版本
            if (this.getConfig("basic.clickMusicInSearch") === "播放歌曲") {
                this.setConfig("basic.clickMusicInSearch", "playMusic");
            } else {
                this.setConfig("basic.clickMusicInSearch", "playMusicAndReplace");
            }

            // @ts-expect-error 兼容旧版本
            if (this.getConfig("basic.clickMusicInAlbum") === "播放专辑") {
                this.setConfig("basic.clickMusicInAlbum", "playAlbum");
            } else {
                this.setConfig("basic.clickMusicInAlbum", "playMusic");
            }

            // @ts-expect-error 兼容旧版本
            if (this.getConfig("basic.tempRemoteDuck") === "暂停") {
                this.setConfig("basic.tempRemoteDuck", "pause");
            } else {
                this.setConfig("basic.tempRemoteDuck", "lowerVolume");
            }

            configStore.set("$schema", "2");
        }


    }

    async setup(): Promise<void> {
        await this.migrateConfig();
    }

    setConfig<K extends keyof IAppConfigProperties>(
        key: K,
        value?: IAppConfigProperties[K] | undefined,
    ): void {
        if (value === undefined) {
            configStore.delete(key);
        } else {
            configStore.set(key, safeStringify(value));
        }
    }

    getConfig<K extends keyof IAppConfigProperties>(
        key: K,
    ): IAppConfigProperties[K] | undefined {
        const value = configStore.getString(key);
        if (value === undefined) {
            return undefined;
        }
        return JSON.parse(value);
    }
}

const appConfig = new AppConfig();
export default appConfig;

/***** hooks *****/
export function useAppConfig<K extends keyof IAppConfigProperties>(key: K): IAppConfigProperties[K] | undefined {
    return useMMKVObject<IAppConfigProperties[K]>(key, configStore)[0];
}