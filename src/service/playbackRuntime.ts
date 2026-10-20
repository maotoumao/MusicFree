import "react-native-get-random-values";

import { ImgAsset } from "@/constants/assetsConst";
import pathConst from "@/constants/pathConst";
import Config from "@/core/appConfig";
import downloader from "@/core/downloader";
import i18n from "@/core/i18n";
import lyricManager from "@/core/lyricManager";
import musicHistory from "@/core/musicHistory";
import MusicSheet from "@/core/musicSheet";
import PluginManager from "@/core/pluginManager";
import TrackPlayer from "@/core/trackPlayer";
import { checkAndCreateDir } from "@/utils/fileUtils";
import { trace } from "@/utils/log";
import type { IPerfLogger } from "@/utils/perfLogger";
import RNTrackPlayer, { AppKilledPlaybackBehavior, Capability } from "react-native-track-player";
import { setupMusicWidget } from "./musicWidget";

export let startedFromWidget = false;

PluginManager.injectDependencies(Config);
musicHistory.injectDependencies(Config);
TrackPlayer.injectDependencies(Config, musicHistory, PluginManager);
downloader.injectDependencies(Config, PluginManager);
lyricManager.injectDependencies(TrackPlayer, Config, PluginManager);
MusicSheet.injectDependencies(Config);

let dataSetup: Promise<void> | undefined;
let pluginsSetup: Promise<void> | undefined;
let nativeSetup: Promise<void> | undefined;
let queueSetup: Promise<void> | undefined;
let runtimeSetup: Promise<void> | undefined;

/** UI and headless tasks share migrations and data; opening the UI never reloads a live queue. */
export function setupPlaybackData() {
    if (!dataSetup) {
        dataSetup = (async () => {
            await Promise.all([
                ...[
                    pathConst.dataPath, pathConst.logPath, pathConst.cachePath, pathConst.pluginPath,
                    pathConst.lrcCachePath, pathConst.downloadCachePath, pathConst.localLrcPath,
                ].map(folder => checkAndCreateDir(folder)),
                checkAndCreateDir(pathConst.downloadPath).then(() => checkAndCreateDir(pathConst.downloadMusicPath)),
            ]);
            await Promise.all([Config.setup(), MusicSheet.setup(), musicHistory.setup()]);
            i18n.setup();
        })();
        dataSetup.catch(() => {
            dataSetup = undefined;
        });
    }
    return dataSetup;
}

export function setupPlaybackPlugins() {
    if (!pluginsSetup) {
        pluginsSetup = setupPlaybackData().then(() => PluginManager.setup());
        pluginsSetup.catch(() => {
            pluginsSetup = undefined;
        });
    }
    return pluginsSetup;
}

export function setupNativePlayer() {
    if (!nativeSetup) {
        nativeSetup = setupPlaybackData().then(initNativePlayer);
        nativeSetup.catch(() => {
            nativeSetup = undefined;
        });
    }
    return nativeSetup;
}

async function initNativePlayer() {
    try {
        await RNTrackPlayer.setupPlayer({
            maxCacheSize: Config.getConfig("basic.maxCacheSize") ?? 1024 * 1024 * 512,
        });
    } catch (error: any) {
        if (error?.code !== "player_already_initialized" &&
            error?.message !== "The player has already been initialized via setupPlayer.") throw error;
    }
    const capabilities = [Capability.Play, Capability.Pause, Capability.SkipToNext, Capability.SkipToPrevious];
    if (Config.getConfig("basic.showExitOnNotification")) capabilities.push(Capability.Stop);
    await RNTrackPlayer.updateOptions({
        icon: ImgAsset.logoTransparent,
        progressUpdateEventInterval: 1,
        android: {
            alwaysPauseOnInterruption: true,
            appKilledPlaybackBehavior: AppKilledPlaybackBehavior.ContinuePlayback,
        },
        capabilities,
        notificationCapabilities: [...capabilities, Capability.SeekTo],
        compactCapabilities: capabilities,
    });
}

/** Restore once per JS runtime, including when a widget starts playback before the first UI render. */
export function initTrackPlayer(logger?: IPerfLogger, background = false) {
    if (!runtimeSetup) {
        startedFromWidget = background;
        runtimeSetup = (async () => {
            const native = setupNativePlayer();
            // Attach a handler immediately while plugin I/O runs in parallel.
            native.catch(() => undefined);
            await setupPlaybackPlugins();
            await native;
            logger?.mark("播放器初始化完成");
            if (!queueSetup) {
                queueSetup = TrackPlayer.setupTrackPlayer({
                    background,
                });
                queueSetup.catch(() => {
                    queueSetup = undefined;
                });
            }
            await queueSetup;
            await lyricManager.setup();
            setupMusicWidget();
            trace("播放列表初始化完成");
            logger?.mark("播放列表初始化完成");
        })();
        runtimeSetup.catch(() => {
            runtimeSetup = undefined;
        });
    }
    return runtimeSetup;
}
