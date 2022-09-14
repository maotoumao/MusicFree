import MusicQueue from '@/core/musicQueue';
import MusicSheet from '@/core/musicSheet';
import {check, PERMISSIONS, request} from 'react-native-permissions';
import TrackPlayer, {Capability} from 'react-native-track-player';
import 'react-native-get-random-values';
import Config from '@/core/config';
import RNBootSplash from 'react-native-bootsplash';
import Download from '@/core/download';
import pathConst from '@/constants/pathConst';
import {checkAndCreateDir} from '@/utils/fileUtils';
import {errorLog} from '@/utils/log';
import MediaMeta from '@/core/mediaMeta';
import Cache from '@/core/cache';
import PluginManager from '@/core/pluginManager';

/** app加载前执行
 * 1. 检查权限
 * 2. 数据初始化
 * 3.
 */
async function _bootstrap() {
    // 1. 检查权限
    const [readStoragePermission, writeStoragePermission] = await Promise.all([
        check(PERMISSIONS.ANDROID.READ_EXTERNAL_STORAGE),
        check(PERMISSIONS.ANDROID.WRITE_EXTERNAL_STORAGE),
    ]);
    if (
        !(
            readStoragePermission === 'granted' &&
            writeStoragePermission === 'granted'
        )
    ) {
        await request(PERMISSIONS.ANDROID.READ_EXTERNAL_STORAGE);
        await request(PERMISSIONS.ANDROID.WRITE_EXTERNAL_STORAGE);
    }

    // 2. 数据初始化
    /** 初始化路径 */
    await setupFolder();
    // 加载配置
    await Promise.all([Config.setup(), MediaMeta.setup(), MusicSheet.setup()]);
    // 加载插件
    try {
        await TrackPlayer.setupPlayer({
            maxCacheSize: 1024 * 1024 * 512,
        });
    } catch (e: any) {
        if (
            e?.message !==
            'The player has already been initialized via setupPlayer.'
        ) {
            throw e;
        }
    }
    await TrackPlayer.updateOptions({
        progressUpdateEventInterval: 0.4,
        stopWithApp: false,
        alwaysPauseOnInterruption: true,
        capabilities: [
            Capability.Play,
            Capability.Pause,
            Capability.SkipToNext,
            Capability.SkipToPrevious,
        ],
        compactCapabilities: [
            Capability.Play,
            Capability.Pause,
            Capability.SkipToNext,
            Capability.SkipToPrevious,
        ],
        notificationCapabilities: [
            Capability.Play,
            Capability.Pause,
            Capability.SkipToNext,
            Capability.SkipToPrevious,
        ],
    });
    await Cache.setup();
    await Download.setup();
    await PluginManager.setup();
    await MusicQueue.setup();

    ErrorUtils.setGlobalHandler(error => {
        errorLog('未捕获的错误', error);
    });
}

/** 初始化 */
async function setupFolder() {
    await Promise.all([
        checkAndCreateDir(pathConst.dataPath),
        checkAndCreateDir(pathConst.logPath),
        checkAndCreateDir(pathConst.cachePath),
        checkAndCreateDir(pathConst.storagePath),
        checkAndCreateDir(pathConst.pluginPath),
        checkAndCreateDir(pathConst.lrcCachePath),
    ]);
}

export default async function () {
    try {
        await _bootstrap();
    } catch (e) {
        errorLog('初始化出错', e);
        console.log(e);
    }
    // 隐藏开屏动画
    console.log('HIDE');
    RNBootSplash.hide({fade: true});
}
