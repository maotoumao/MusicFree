import {internalSerialzeKey, internalSymbolKey} from '@/constants/commonConst';
import pathConst from '@/constants/pathConst';
import {checkAndCreateDir} from '@/utils/fileUtils';
import {isSameMediaItem} from '@/utils/mediaItem';
import StateMapper from '@/utils/stateMapper';
import {setStorage} from '@/utils/storage';
import Toast from '@/utils/toast';
import produce from 'immer';
import {useEffect, useState} from 'react';
import {unlink, downloadFile, readDir} from 'react-native-fs';

import Config from './config';
import MediaMeta from './mediaMeta';
import PluginManager from './pluginManager';

interface IDownloadMusicOptions {
    musicItem: IMusic.IMusicItem;
    filename: string;
    jobId?: number;
}
// todo： 直接把下载信息写在meta里面就好了
/** 已下载 */
let downloadedMusic: IMusic.IMusicItem[] = [];
/** 下载中 */
let downloadingMusicQueue: IDownloadMusicOptions[] = [];
/** 队列中 */
let pendingMusicQueue: IDownloadMusicOptions[] = [];

/** 进度 */
let downloadingProgress: Record<string, {progress: number; size: number}> = {};

const downloadedStateMapper = new StateMapper(() => downloadedMusic);
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

/** 根据文件名解析 */
function parseFilename(fn: string): IMusic.IMusicItemBase | null {
    const data = fn.slice(0, fn.lastIndexOf('.')).split('@');
    const [platform, id, title, artist] = data;
    if (!platform || !id) {
        return null;
    }
    return {
        id,
        platform,
        title,
        artist,
    };
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
    await checkAndCreateDir(pathConst.downloadPath);
    // const jsonData = await loadLocalJson(pathConst.downloadPath);

    const newDownloadedData: Record<string, IMusic.IMusicItem> = {};
    const downloads = await readDir(pathConst.downloadPath);
    downloadedMusic = [];

    for (let i = 0; i < downloads.length; ++i) {
        const data = parseFilename(downloads[i].name);
        if (data) {
            const platform = data?.platform;
            const id = data?.id;
            if (platform && id) {
                const mi = MediaMeta.get(data) ?? {};
                mi.id = id;
                mi.platform = platform;
                mi.title = mi.title ?? data.title;
                mi.artist = mi.artist ?? data.artist;
                mi[internalSymbolKey] = {
                    localPath: downloads[i].path,
                };
                downloadedMusic.push(mi as IMusic.IMusicItem);
            }
        }
    }
    downloadedStateMapper.notify();
    // 去掉冗余数据
    setStorage('download-music', newDownloadedData);
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
        toFile: pathConst.downloadPath + nextItem.filename,
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
        // 下载完成
        downloadedMusic = produce(downloadedMusic, _ => {
            if (
                downloadedMusic.findIndex(_ =>
                    isSameMediaItem(musicItem, _),
                ) === -1
            ) {
                _.push({
                    ...musicItem,
                    [internalSymbolKey]: {
                        localPath: pathConst.downloadPath + nextItem.filename,
                    },
                });
            }
            return _;
        });
        removeFromDownloadingQueue(nextItem);
        MediaMeta.update({
            ...musicItem,
            [internalSerialzeKey]: {
                downloaded: true,
                local: {
                    localUrl: pathConst.downloadPath + nextItem.filename,
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
        downloadedStateMapper.notify();
        downloadNext();
    } catch {
        downloadingMusicQueue = produce(downloadingMusicQueue, _ =>
            _.filter(item => !isSameMediaItem(item.musicItem, musicItem)),
        );
    }
}

/** 下载音乐 */
function downloadMusic(musicItems: IMusic.IMusicItem | IMusic.IMusicItem[]) {
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

/** 是否下载 */
function isDownloaded(mi: IMusic.IMusicItem | null) {
    return mi
        ? downloadedMusic.findIndex(_ => isSameMediaItem(_, mi)) !== -1
        : false;
}

/** 获取下载的音乐 */
function getDownloaded(mi: ICommon.IMediaBase | null) {
    return mi ? downloadedMusic.find(_ => isSameMediaItem(_, mi)) : null;
}

/** 移除下载的文件 */
async function removeDownloaded(mi: IMusic.IMusicItem) {
    const localPath = getDownloaded(mi)?.[internalSymbolKey]?.localPath;
    if (localPath) {
        await unlink(localPath);
        downloadedMusic = downloadedMusic.filter(_ => !isSameMediaItem(_, mi));
        MediaMeta.update(mi, undefined);
        downloadedStateMapper.notify();
    }
}

/** 某个音乐是否被下载-状态 */
function useIsDownloaded(mi: IMusic.IMusicItem | null) {
    const downloadedMusicState = downloadedStateMapper.useMappedState();
    const [downloaded, setDownloaded] = useState<boolean>(isDownloaded(mi));
    useEffect(() => {
        if (!mi) {
            setDownloaded(false);
        } else {
            setDownloaded(
                downloadedMusicState.findIndex(_ => isSameMediaItem(mi, _)) !==
                    -1,
            );
        }
    }, [downloadedMusicState, mi]);
    return downloaded;
}

const Download = {
    downloadMusic,
    setup: setupDownload,
    useDownloadedMusic: downloadedStateMapper.useMappedState,
    useDownloadingMusic: downloadingQueueStateMapper.useMappedState,
    usePendingMusic: pendingMusicQueueStateMapper.useMappedState,
    useDownloadingProgress: downloadingProgressStateMapper.useMappedState,
    isDownloaded,
    useIsDownloaded,
    getDownloaded,
    removeDownloaded,
};

export default Download;
