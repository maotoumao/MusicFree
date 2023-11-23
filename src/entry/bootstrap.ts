import MusicQueue from '@/core/musicQueue';
import MusicSheet from '@/core/musicSheet';
import {check, PERMISSIONS, request} from 'react-native-permissions';
import TrackPlayer, {Capability} from 'react-native-track-player';
import 'react-native-get-random-values';
import Config from '@/core/config';
import RNBootSplash from 'react-native-bootsplash';
import pathConst from '@/constants/pathConst';
import {checkAndCreateDir} from '@/utils/fileUtils';
import {errorLog, trace} from '@/utils/log';
import MediaMeta from '@/core/mediaMeta';
import Cache from '@/core/cache';
import PluginManager from '@/core/pluginManager';
import Network from '@/core/network';
import {ImgAsset} from '@/constants/assetsConst';
import LocalMusicSheet from '@/core/localMusicSheet';
import {Linking} from 'react-native';
import Theme from '@/core/theme';
import LyricManager from '@/core/lyricManager';
import {getStorage, setStorage} from '@/utils/storage';
import Toast from '@/utils/toast';
import {localPluginHash, supportLocalMediaType} from '@/constants/commonConst';

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
    trace('文件夹初始化完成');
    // 加载配置
    await Promise.all([
        Config.setup(),
        MediaMeta.setup(),
        MusicSheet.setup(),
        Network.setup(),
    ]);
    trace('配置初始化完成');
    // 加载插件
    try {
        await TrackPlayer.setupPlayer({
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
    await TrackPlayer.updateOptions({
        icon: ImgAsset.logoTransparent,
        alwaysPauseOnInterruption: true,
        progressUpdateEventInterval: 1,
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
    trace('播放器初始化完成');
    await Cache.setup();
    trace('缓存初始化完成');
    await PluginManager.setup();
    trace('插件初始化完成');
    await MusicQueue.setup();
    trace('播放列表初始化完成');
    await LocalMusicSheet.setup();
    trace('本地音乐初始化完成');
    Theme.setup();
    trace('主题初始化完成');
    await LyricManager.setup();

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
    RNBootSplash.hide({fade: true});
}

/** 不需要阻塞的 */
async function extraMakeup() {
    // 自动更新
    try {
        if (Config.get('setting.basic.autoUpdatePlugin')) {
            const lastUpdated =
                (await getStorage('pluginLastupdatedTime')) || 0;
            const now = Date.now();
            if (Math.abs(now - lastUpdated) > 86400000) {
                setStorage('pluginLastupdatedTime', now);
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
            if (url.endsWith('.js')) {
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
                    MusicQueue.play(musicItem);
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
        MusicQueue.play();
    }
}
