import {check, PERMISSIONS, request} from 'react-native-permissions';
import RNTrackPlayer, {
    AppKilledPlaybackBehavior,
    Capability,
} from 'react-native-track-player';
import 'react-native-get-random-values';
import Config from '@/core/config';
import pathConst from '@/constants/pathConst';
import {checkAndCreateDir} from '@/utils/fileUtils';
import {errorLog, trace} from '@/utils/log';
import MediaMeta from '@/core/mediaMeta.old';
import PluginManager from '@/core/pluginManager';
import Network from '@/core/network';
import {ImgAsset} from '@/constants/assetsConst';
import LocalMusicSheet from '@/core/localMusicSheet';
import {Linking, Platform} from 'react-native';
import Theme from '@/core/theme';
import LyricManager from '@/core/lyricManager';
import Toast from '@/utils/toast';
import {localPluginHash, supportLocalMediaType} from '@/constants/commonConst';
import TrackPlayer from '@/core/trackPlayer';
import musicHistory from '@/core/musicHistory';
import PersistStatus from '@/core/persistStatus';
import {perfLogger} from '@/utils/perfLogger';
import * as SplashScreen from 'expo-splash-screen';
import MusicSheet from '@/core/musicSheet';
import NativeUtils from '@/native/utils';
import {showDialog} from '@/components/dialogs/useDialog.ts';

/** app加载前执行
 * 1. 检查权限
 * 2. 数据初始化
 * 3.
 */

async function _bootstrap() {
    await SplashScreen.preventAutoHideAsync()
        .then(result =>
            console.log(
                `SplashScreen.preventAutoHideAsync() succeeded: ${result}`,
            ),
        )
        .catch(console.warn); // it's good to explicitly catch and inspect any error
    const logger = perfLogger();
    // 1. 检查权限
    if (Platform.OS === 'android' && Platform.Version >= 30) {
        const hasPermission = await NativeUtils.checkStoragePermission();
        if (
            !hasPermission &&
            !PersistStatus.get('app.skipBootstrapStorageDialog')
        ) {
            showDialog('CheckStorage');
        }
    } else {
        const [readStoragePermission, writeStoragePermission] =
            await Promise.all([
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
    }
    logger.mark('权限检查完成');

    // 2. 数据初始化
    /** 初始化路径 */
    await setupFolder();
    trace('文件夹初始化完成');
    logger.mark('文件夹初始化完成');

    // 加载配置
    await Promise.all([
        Config.setup().then(() => {
            logger.mark('Config');
        }),
        MediaMeta.setup().then(() => {
            logger.mark('MediaMeta');
        }),
        MusicSheet.setup().then(() => {
            logger.mark('MusicSheet');
        }),
        musicHistory.setupMusicHistory().then(() => {
            logger.mark('musicHistory');
        }),
    ]);
    trace('配置初始化完成');
    logger.mark('配置初始化完成');

    // 加载插件
    try {
        await RNTrackPlayer.setupPlayer({
            maxCacheSize:
                Config.get('setting.basic.maxCacheSize') ?? 1024 * 1024 * 512,
        });
    } catch (e: any) {
        if (
            e?.message !==
            'The player has already been initialized via setupPlayer.'
        ) {
            throw e;
        }
    }
    logger.mark('加载播放器');

    const capabilities = Config.get('setting.basic.showExitOnNotification')
        ? [
              Capability.Play,
              Capability.Pause,
              Capability.SkipToNext,
              Capability.SkipToPrevious,
              Capability.Stop,
          ]
        : [
              Capability.Play,
              Capability.Pause,
              Capability.SkipToNext,
              Capability.SkipToPrevious,
          ];
    await RNTrackPlayer.updateOptions({
        icon: ImgAsset.logoTransparent,
        progressUpdateEventInterval: 1,
        android: {
            alwaysPauseOnInterruption: true,
            appKilledPlaybackBehavior:
                AppKilledPlaybackBehavior.ContinuePlayback,
        },
        capabilities: capabilities,
        compactCapabilities: capabilities,
        notificationCapabilities: [...capabilities, Capability.SeekTo],
    });
    logger.mark('播放器初始化完成');
    trace('播放器初始化完成');

    await PluginManager.setup();
    logger.mark('插件初始化完成');

    trace('插件初始化完成');
    await TrackPlayer.setupTrackPlayer();
    trace('播放列表初始化完成');
    logger.mark('播放列表初始化完成');

    await LocalMusicSheet.setup();
    trace('本地音乐初始化完成');
    logger.mark('本地音乐初始化完成');

    Theme.setup();
    trace('主题初始化完成');
    logger.mark('主题初始化完成');

    await LyricManager.setup();

    logger.mark('歌词初始化完成');

    extraMakeup();
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
        checkAndCreateDir(pathConst.pluginPath),
        checkAndCreateDir(pathConst.lrcCachePath),
        checkAndCreateDir(pathConst.downloadCachePath),
        checkAndCreateDir(pathConst.localLrcPath),
        checkAndCreateDir(pathConst.downloadPath).then(() => {
            checkAndCreateDir(pathConst.downloadMusicPath);
        }),
    ]);
}

export default async function () {
    try {
        await _bootstrap();
    } catch (e) {
        errorLog('初始化出错', e);
    }
    // 隐藏开屏动画
    console.log('HIDE');
    await SplashScreen.hideAsync();
}

/** 不需要阻塞的 */
async function extraMakeup() {
    // 自动更新
    try {
        // 初始化网络状态
        Network.setup();

        if (Config.get('setting.basic.autoUpdatePlugin')) {
            const lastUpdated = PersistStatus.get('app.pluginUpdateTime') || 0;
            const now = Date.now();
            if (Math.abs(now - lastUpdated) > 86400000) {
                PersistStatus.set('app.pluginUpdateTime', now);
                const plugins = PluginManager.getValidPlugins();
                for (let i = 0; i < plugins.length; ++i) {
                    const srcUrl = plugins[i].instance.srcUrl;
                    if (srcUrl) {
                        await PluginManager.installPluginFromUrl(srcUrl);
                    }
                }
            }
        }
    } catch {}

    async function handleLinkingUrl(url: string) {
        // 插件
        try {
            if (url.startsWith('musicfree://install/')) {
                const plugins = url
                    .slice(20)
                    .split(',')
                    .map(decodeURIComponent);
                await Promise.all(
                    plugins.map(it =>
                        PluginManager.installPluginFromUrl(it).catch(() => {}),
                    ),
                );
                Toast.success('安装成功~');
            } else if (url.endsWith('.js')) {
                PluginManager.installPlugin(url, {
                    notCheckVersion: Config.get(
                        'setting.basic.notCheckPluginVersion',
                    ),
                })
                    .then(res => {
                        Toast.success(`插件「${res.name}」安装成功~`);
                    })
                    .catch(e => {
                        console.log(e);
                        Toast.warn(e?.message ?? '无法识别此插件');
                    });
            } else if (supportLocalMediaType.some(it => url.endsWith(it))) {
                // 本地播放
                const musicItem = await PluginManager.getByHash(
                    localPluginHash,
                )?.instance?.importMusicItem?.(url);
                console.log(musicItem);
                if (musicItem) {
                    TrackPlayer.play(musicItem);
                }
            }
        } catch {}
    }

    // 开启监听
    Linking.addEventListener('url', data => {
        if (data.url) {
            handleLinkingUrl(data.url);
        }
    });
    const initUrl = await Linking.getInitialURL();
    if (initUrl) {
        handleLinkingUrl(initUrl);
    }

    if (Config.get('setting.basic.autoPlayWhenAppStart')) {
        TrackPlayer.play();
    }
}
