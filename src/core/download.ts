import {
    internalSerializeKey,
    supportLocalMediaType,
} from '@/constants/commonConst';
import pathConst from '@/constants/pathConst';
import {addFileScheme, escapeCharacter, mkdirR} from '@/utils/fileUtils';
import {errorLog} from '@/utils/log';
import {isSameMediaItem} from '@/utils/mediaItem';
import {getQualityOrder} from '@/utils/qualities';
import StateMapper from '@/utils/stateMapper';
import Toast from '@/utils/toast';
import {produce} from 'immer';
import {InteractionManager} from 'react-native';
import {copyFile, downloadFile, exists, unlink} from 'react-native-fs';

import Config from './config';
import LocalMusicSheet from './localMusicSheet';
import MediaMeta from './mediaExtra';
import Network from './network';
import PluginManager from './pluginManager';
import {check, PERMISSIONS} from 'react-native-permissions';
import path from 'path-browserify';
import {
    getCurrentDialog,
    hideDialog,
    showDialog,
} from '@/components/dialogs/useDialog';
import {nanoid} from 'nanoid';

/** 队列中的元素 */
interface IDownloadMusicOptions {
    /** 要下载的音乐 */
    musicItem: IMusic.IMusicItem;
    /** 目标文件名 */
    filename: string;
    /** 下载id */
    jobId?: number;
    /** 下载音质 */
    quality?: IMusic.IQualityKey;
}

/** 下载中 */
let downloadingMusicQueue: IDownloadMusicOptions[] = [];
/** 队列中 */
let pendingMusicQueue: IDownloadMusicOptions[] = [];
/** 下载进度 */
let downloadingProgress: Record<string, {progress: number; size: number}> = {};
/** 错误信息 */
let hasError: boolean = false;

const downloadingQueueStateMapper = new StateMapper(
    () => downloadingMusicQueue,
);
const pendingMusicQueueStateMapper = new StateMapper(() => pendingMusicQueue);
const downloadingProgressStateMapper = new StateMapper(
    () => downloadingProgress,
);

/** 匹配文件后缀 */
const getExtensionName = (url: string) => {
    const regResult = url.match(
        /^https?\:\/\/.+\.([^\?\.]+?$)|(?:([^\.]+?)\?.+$)/,
    );
    if (regResult) {
        return regResult[1] ?? regResult[2] ?? 'mp3';
    } else {
        return 'mp3';
    }
};

/** 生成下载文件 */
const getDownloadPath = (fileName: string) => {
    const dlPath =
        Config.get('setting.basic.downloadPath') ?? pathConst.downloadMusicPath;
    if (!dlPath.endsWith('/')) {
        return `${dlPath}/${fileName ?? ''}`;
    }
    return fileName ? dlPath + fileName : dlPath;
};

const getCacheDownloadPath = (fileName: string) => {
    const cachePath = pathConst.downloadCachePath;
    if (!cachePath.endsWith('/')) {
        return `${cachePath}/${fileName ?? ''}`;
    }
    return fileName ? cachePath + fileName : cachePath;
};

/** 从待下载中移除 */
function removeFromPendingQueue(item: IDownloadMusicOptions) {
    const targetIndex = pendingMusicQueue.findIndex(_ =>
        isSameMediaItem(_.musicItem, item.musicItem),
    );
    if (targetIndex !== -1) {
        pendingMusicQueue = pendingMusicQueue
            .slice(0, targetIndex)
            .concat(pendingMusicQueue.slice(targetIndex + 1));
        pendingMusicQueueStateMapper.notify();
    }
}

/** 从下载中队列移除 */
function removeFromDownloadingQueue(item: IDownloadMusicOptions) {
    const targetIndex = downloadingMusicQueue.findIndex(_ =>
        isSameMediaItem(_.musicItem, item.musicItem),
    );
    if (targetIndex !== -1) {
        downloadingMusicQueue = downloadingMusicQueue
            .slice(0, targetIndex)
            .concat(downloadingMusicQueue.slice(targetIndex + 1));
        downloadingQueueStateMapper.notify();
    }
}

/** 防止高频同步 */
let progressNotifyTimer: any = null;
function startNotifyProgress() {
    if (progressNotifyTimer) {
        return;
    }

    progressNotifyTimer = setTimeout(() => {
        progressNotifyTimer = null;
        downloadingProgressStateMapper.notify();
        startNotifyProgress();
    }, 500);
}

function stopNotifyProgress() {
    if (progressNotifyTimer) {
        clearTimeout(progressNotifyTimer);
    }
    progressNotifyTimer = null;
}

/** 生成下载文件名 */
function generateFilename(musicItem: IMusic.IMusicItem) {
    return `${escapeCharacter(musicItem.platform)}@${escapeCharacter(
        musicItem.id,
    )}@${escapeCharacter(musicItem.title)}@${escapeCharacter(
        musicItem.artist,
    )}`.slice(0, 200);
}

/** todo 可以配置一个说明文件 */
// async function loadLocalJson(dirBase: string) {
//   const jsonPath = dirBase + 'data.json';
//   if (await exists(jsonPath)) {
//     try {
//       const result = await readFile(jsonPath, 'utf8');
//       return JSON.parse(result);
//     } catch {
//       return {};
//     }
//   }
//   return {};
// }

let maxDownload = 3;
/** 队列下载*/
async function downloadNext() {
    // todo 最大同时下载3个，可设置
    if (
        downloadingMusicQueue.length >= maxDownload ||
        pendingMusicQueue.length === 0
    ) {
        return;
    }
    // 下一个下载的为pending的第一个
    let nextDownloadItem = pendingMusicQueue[0];
    const musicItem = nextDownloadItem.musicItem;
    let url = musicItem.url;
    let headers = musicItem.headers;
    removeFromPendingQueue(nextDownloadItem);
    downloadingMusicQueue = produce(downloadingMusicQueue, draft => {
        draft.push(nextDownloadItem);
    });
    downloadingQueueStateMapper.notify();
    const quality = nextDownloadItem.quality;
    const plugin = PluginManager.getByName(musicItem.platform);
    // 插件播放
    try {
        if (plugin) {
            const qualityOrder = getQualityOrder(
                quality ??
                    Config.get('setting.basic.defaultDownloadQuality') ??
                    'standard',
                Config.get('setting.basic.downloadQualityOrder') ?? 'asc',
            );
            let data: IPlugin.IMediaSourceResult | null = null;
            for (let quality of qualityOrder) {
                try {
                    data = await plugin.methods.getMediaSource(
                        musicItem,
                        quality,
                        1,
                        true,
                    );
                    if (!data?.url) {
                        continue;
                    }
                    break;
                } catch {}
            }
            url = data?.url ?? url;
            headers = data?.headers;
        }
        if (!url) {
            throw new Error('empty');
        }
    } catch (e: any) {
        /** 无法下载，跳过 */
        errorLog('下载失败-无法获取下载链接', {
            item: {
                id: nextDownloadItem.musicItem.id,
                title: nextDownloadItem.musicItem.title,
                platform: nextDownloadItem.musicItem.platform,
                quality: nextDownloadItem.quality,
            },
            reason: e?.message ?? e,
        });
        hasError = true;
        removeFromDownloadingQueue(nextDownloadItem);
        return;
    }
    /** 预处理完成，接下来去下载音乐 */
    downloadNextAfterInteraction();
    let extension = getExtensionName(url);
    const extensionWithDot = `.${extension}`;
    if (supportLocalMediaType.every(_ => _ !== extensionWithDot)) {
        extension = 'mp3';
    }
    /** 目标下载地址 */
    const cacheDownloadPath = addFileScheme(
        getCacheDownloadPath(`${nanoid()}.${extension}`),
    );
    const targetDownloadPath = addFileScheme(
        getDownloadPath(`${nextDownloadItem.filename}.${extension}`),
    );
    const {promise, jobId} = downloadFile({
        fromUrl: url ?? '',
        toFile: cacheDownloadPath,
        headers: headers,
        background: true,
        begin(res) {
            downloadingProgress = produce(downloadingProgress, _ => {
                _[nextDownloadItem.filename] = {
                    progress: 0,
                    size: res.contentLength,
                };
            });
            startNotifyProgress();
        },
        progress(res) {
            downloadingProgress = produce(downloadingProgress, _ => {
                _[nextDownloadItem.filename] = {
                    progress: res.bytesWritten,
                    size: res.contentLength,
                };
            });
        },
    });
    nextDownloadItem = {...nextDownloadItem, jobId};

    let folder = path.dirname(targetDownloadPath);
    let folderExists = await exists(folder);

    if (!folderExists) {
        await mkdirR(folder);
    }

    try {
        await promise;
        await copyFile(cacheDownloadPath, targetDownloadPath);
        /** 下载完成 */
        LocalMusicSheet.addMusicDraft({
            ...musicItem,
            [internalSerializeKey]: {
                localPath: targetDownloadPath,
            },
        });
        MediaMeta.update(musicItem, {
            downloaded: true,
            localPath: targetDownloadPath,
        });
        // const primaryKey = plugin?.instance.primaryKey ?? [];
        // if (!primaryKey.includes('id')) {
        //     primaryKey.push('id');
        // }
        // const stringifyMeta: Record<string, any> = {
        //     title: musicItem.title,
        //     artist: musicItem.artist,
        //     album: musicItem.album,
        //     lrc: musicItem.lrc,
        //     platform: musicItem.platform,
        // };
        // primaryKey.forEach(_ => {
        //     stringifyMeta[_] = musicItem[_];
        // });

        // await Mp3Util.getMediaTag(filePath).then(_ => {
        //     console.log(_);
        // }).catch(console.log);
    } catch (e: any) {
        console.log(e, 'downloaderror');
        /** 下载出错 */
        errorLog('下载失败', {
            item: {
                id: nextDownloadItem.musicItem.id,
                title: nextDownloadItem.musicItem.title,
                platform: nextDownloadItem.musicItem.platform,
                quality: nextDownloadItem.quality,
            },
            reason: e?.message ?? e,
            targetDownloadPath: targetDownloadPath,
        });
        hasError = true;
    } finally {
        await unlink(cacheDownloadPath);
    }
    removeFromDownloadingQueue(nextDownloadItem);
    downloadingProgress = produce(downloadingProgress, draft => {
        if (draft[nextDownloadItem.filename]) {
            delete draft[nextDownloadItem.filename];
        }
    });
    downloadNextAfterInteraction();
    if (downloadingMusicQueue.length === 0) {
        stopNotifyProgress();
        LocalMusicSheet.saveLocalSheet();
        if (hasError) {
            try {
                const perm = await check(
                    PERMISSIONS.ANDROID.WRITE_EXTERNAL_STORAGE,
                );
                if (perm !== 'granted') {
                    Toast.warn('权限不足，请检查是否授予写入文件的权限');
                } else {
                    throw new Error();
                }
            } catch {
                if (getCurrentDialog()?.name !== 'SimpleDialog') {
                    showDialog('SimpleDialog', {
                        title: '下载失败',
                        content:
                            '部分歌曲下载失败，如果无法下载请检查系统设置中是否授予完整文件读写权限；或者去【侧边栏-权限管理】中查看文件读写权限是否勾选',
                        onOk: hideDialog,
                    });
                }
            }
        } else {
            Toast.success('下载完成');
        }
        hasError = false;
        downloadingMusicQueue = [];
        pendingMusicQueue = [];
        downloadingQueueStateMapper.notify();
        pendingMusicQueueStateMapper.notify();
    }
}

async function downloadNextAfterInteraction() {
    InteractionManager.runAfterInteractions(downloadNext);
}

/** 加入下载队列 */
function downloadMusic(
    musicItems: IMusic.IMusicItem | IMusic.IMusicItem[],
    quality?: IMusic.IQualityKey,
) {
    if (Network.isOffline()) {
        Toast.warn('当前无网络，无法下载');
        return;
    }
    if (
        Network.isCellular() &&
        !Config.get('setting.basic.useCelluarNetworkDownload') &&
        getCurrentDialog()?.name !== 'SimpleDialog'
    ) {
        showDialog('SimpleDialog', {
            title: '流量提醒',
            content:
                '当前非WIFI环境，侧边栏设置中打开【使用移动网络下载】功能后可继续下载',
        });
        return;
    }
    // 如果已经在下载中
    if (!Array.isArray(musicItems)) {
        musicItems = [musicItems];
    }
    hasError = false;
    musicItems = musicItems.filter(
        musicItem =>
            pendingMusicQueue.findIndex(_ =>
                isSameMediaItem(_.musicItem, musicItem),
            ) === -1 &&
            downloadingMusicQueue.findIndex(_ =>
                isSameMediaItem(_.musicItem, musicItem),
            ) === -1 &&
            !LocalMusicSheet.isLocalMusic(musicItem),
    );
    const enqueueData = musicItems.map(_ => {
        return {
            musicItem: _,
            filename: generateFilename(_),
            quality,
        };
    });
    if (enqueueData.length) {
        pendingMusicQueue = pendingMusicQueue.concat(enqueueData);
        pendingMusicQueueStateMapper.notify();
        maxDownload = +(Config.get('setting.basic.maxDownload') ?? 3);
        downloadNextAfterInteraction();
    }
}

const Download = {
    downloadMusic,
    useDownloadingMusic: downloadingQueueStateMapper.useMappedState,
    usePendingMusic: pendingMusicQueueStateMapper.useMappedState,
    useDownloadingProgress: downloadingProgressStateMapper.useMappedState,
};

export default Download;
