import {internalSerializeKey} from '@/constants/commonConst';
import pathConst from '@/constants/pathConst';
import {isSameMediaItem} from '@/utils/mediaItem';
import StateMapper from '@/utils/stateMapper';
import Toast from '@/utils/toast';
import produce from 'immer';
import {downloadFile} from 'react-native-fs';

import Config from './config';
import LocalMusicSheet from './localMusicSheet';
import MediaMeta from './mediaMeta';
import Network from './network';
import PluginManager from './pluginManager';

interface IDownloadMusicOptions {
    musicItem: IMusic.IMusicItem;
    filename: string;
    jobId?: number;
}
// todo： 直接把下载信息写在meta里面就好了
/** 下载中 */
let downloadingMusicQueue: IDownloadMusicOptions[] = [];
/** 队列中 */
let pendingMusicQueue: IDownloadMusicOptions[] = [];

/** 进度 */
let downloadingProgress: Record<string, {progress: number; size: number}> = {};

const downloadingQueueStateMapper = new StateMapper(
    () => downloadingMusicQueue,
);
const pendingMusicQueueStateMapper = new StateMapper(() => pendingMusicQueue);
const downloadingProgressStateMapper = new StateMapper(
    () => downloadingProgress,
);

/** 从待下载中移除 */
function removeFromPendingQueue(item: IDownloadMusicOptions) {
    pendingMusicQueue = pendingMusicQueue.filter(
        _ => !isSameMediaItem(_.musicItem, item.musicItem),
    );
    pendingMusicQueueStateMapper.notify();
}

/** 从下载中队列移除 */
function removeFromDownloadingQueue(item: IDownloadMusicOptions) {
    downloadingMusicQueue = downloadingMusicQueue.filter(
        _ => !isSameMediaItem(_.musicItem, item.musicItem),
    );
    downloadingQueueStateMapper.notify();
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
    }, 400);
}

function stopNotifyProgress() {
    if (progressNotifyTimer) {
        clearInterval(progressNotifyTimer);
    }
    progressNotifyTimer = null;
}

/** 生成下载文件名 */
function generateFilename(musicItem: IMusic.IMusicItem) {
    return (
        `${musicItem.platform}@${musicItem.id}@${musicItem.title}@${musicItem.artist}`.slice(
            0,
            200,
        ) + '.mp3'
    );
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

/** 初始化 */
async function setupDownload() {
    // // const jsonData = await loadLocalJson(pathConst.downloadMusicPath);
    // const newDownloadedData: Record<string, IMusic.IMusicItem> = {};
    // downloadedMusic = [];
    // try {
    //     const downloads = await readDir(pathConst.downloadMusicPath);
    //     for (let i = 0; i < downloads.length; ++i) {
    //         const data = parseFilename(downloads[i].name);
    //         if (data) {
    //             const platform = data?.platform;
    //             const id = data?.id;
    //             if (platform && id) {
    //                 const mi = MediaMeta.get(data) ?? {};
    //                 mi.id = id;
    //                 mi.platform = platform;
    //                 mi.title = mi.title ?? data.title;
    //                 mi.artist = mi.artist ?? data.artist;
    //                 mi[internalSymbolKey] = {
    //                     localPath: downloads[i].path,
    //                 };
    //                 downloadedMusic.push(mi as IMusic.IMusicItem);
    //             }
    //         }
    //     }
    //     downloadedStateMapper.notify();
    //     // 去掉冗余数据
    //     setStorage('download-music', newDownloadedData);
    // } catch (e) {
    //     errorLog('本地下载初始化失败', e);
    // }
}

let maxDownload = 3;
/** 从队列取出下一个要下载的 */
async function downloadNext() {
    // todo 最大同时下载3个，可设置
    if (
        downloadingMusicQueue.length >= maxDownload ||
        pendingMusicQueue.length === 0
    ) {
        return;
    }
    const nextItem = pendingMusicQueue[0];
    const musicItem = nextItem.musicItem;
    let url = musicItem.url;
    let headers = musicItem.headers;
    removeFromPendingQueue(nextItem);
    downloadingMusicQueue = produce(downloadingMusicQueue, draft => {
        draft.push(nextItem);
    });
    downloadingQueueStateMapper.notify();
    if (!url || !url?.startsWith('http')) {
        // 插件播放
        const plugin = PluginManager.getByName(musicItem.platform);
        if (plugin) {
            try {
                const data = await plugin.methods.getMediaSource(musicItem);
                url = data?.url;
                headers = data?.headers;
            } catch {
                /** 无法下载，跳过 */
                removeFromDownloadingQueue(nextItem);
                return;
            }
        }
    }

    downloadNext();
    const {promise, jobId} = downloadFile({
        fromUrl: url ?? '',
        toFile: pathConst.downloadMusicPath + nextItem.filename,
        headers: headers,
        background: true,
        begin(res) {
            downloadingProgress = produce(downloadingProgress, _ => {
                _[nextItem.filename] = {
                    progress: 0,
                    size: res.contentLength,
                };
            });
            startNotifyProgress();
        },
        progress(res) {
            downloadingProgress = produce(downloadingProgress, _ => {
                _[nextItem.filename] = {
                    progress: res.bytesWritten,
                    size: res.contentLength,
                };
            });
        },
    });
    nextItem.jobId = jobId;
    try {
        await promise;
        LocalMusicSheet.addMusic({
            ...musicItem,
            [internalSerializeKey]: {
                localPath: pathConst.downloadMusicPath + nextItem.filename,
            },
        });
        removeFromDownloadingQueue(nextItem);
        MediaMeta.update({
            ...musicItem,
            [internalSerializeKey]: {
                downloaded: true,
                local: {
                    localUrl: pathConst.downloadMusicPath + nextItem.filename,
                },
            },
        });
        if (downloadingMusicQueue.length === 0) {
            stopNotifyProgress();
            Toast.success('下载完成');
            downloadingMusicQueue = [];
            pendingMusicQueue = [];
            downloadingQueueStateMapper.notify();
            pendingMusicQueueStateMapper.notify();
        }
        delete downloadingProgress[nextItem.filename];
        downloadNext();
    } catch {
        downloadingMusicQueue = produce(downloadingMusicQueue, _ =>
            _.filter(item => !isSameMediaItem(item.musicItem, musicItem)),
        );
    }
}

/** 下载音乐 */
function downloadMusic(musicItems: IMusic.IMusicItem | IMusic.IMusicItem[]) {
    if (Network.isOffline()) {
        Toast.warn('当前无网络，无法下载');
        return;
    }
    if (
        Network.isCellular() &&
        !Config.get('setting.basic.useCelluarNetworkDownload')
    ) {
        Toast.warn('当前设置移动网络不可下载，可在侧边栏基本设置修改');
        return;
    }
    // 如果已经在下载中
    if (!Array.isArray(musicItems)) {
        musicItems = [musicItems];
    }
    musicItems = musicItems.filter(
        musicItem =>
            pendingMusicQueue.findIndex(_ =>
                isSameMediaItem(_.musicItem, musicItem),
            ) === -1 &&
            downloadingMusicQueue.findIndex(_ =>
                isSameMediaItem(_.musicItem, musicItem),
            ) === -1,
    );
    const enqueueData = musicItems.map(_ => ({
        musicItem: _,
        filename: generateFilename(_),
    }));
    if (enqueueData.length) {
        pendingMusicQueue = pendingMusicQueue.concat(enqueueData);
        pendingMusicQueueStateMapper.notify();
        maxDownload = +(Config.get('setting.basic.maxDownload') ?? 3);
        downloadNext();
    }
}

const Download = {
    downloadMusic,
    setup: setupDownload,
    useDownloadingMusic: downloadingQueueStateMapper.useMappedState,
    usePendingMusic: pendingMusicQueueStateMapper.useMappedState,
    useDownloadingProgress: downloadingProgressStateMapper.useMappedState,
};

export default Download;
